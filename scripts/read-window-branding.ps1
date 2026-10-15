param(
  [int[]]$ProcessId = @(),
  [string]$ProcessName = 'Notes for Windows',
  [long]$WindowHandle = 0,
  [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'test-results\window-branding')
)
$ErrorActionPreference = 'Stop'
# Read only the app's window metadata and icon pixels. No window titles, client
# area pixels, note data, window activation, or shell cache changes are involved.
$notesTargets = if ($ProcessId.Count) {
  @(Get-Process -Id $ProcessId -ErrorAction Stop)
} else {
  @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
}
if (-not $notesTargets.Count) { throw "No matching process is running: $ProcessName" }
$notesOutputPath = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($notesOutputPath) | Out-Null

if (-not ('NotesWindowBrandingProbe' -as [type])) {
  $notesReferences = if ($PSVersionTable.PSEdition -eq 'Core') {
    @((Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName) + @([System.Drawing.Icon].Assembly.Location) + @((Get-ChildItem -LiteralPath $PSHOME -Filter 'System.Private.Windows*.dll').FullName)
  } else { @('System.dll', 'System.Core.dll', 'System.Drawing.dll') }
  Add-Type -ReferencedAssemblies $notesReferences -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public sealed class NotesWindowBrandingRecord {
    public int ProcessId;
    public string Handle;
    public bool Visible;
    public string ClassName;
    public string AppUserModelId;
    public string RelaunchCommand;
    public string RelaunchIconResource;
    public string RelaunchDisplayNameResource;
    public string LargeIconSource;
    public string LargeIconPath;
    public string SmallIconSource;
    public string SmallIconPath;
    public List<string> Errors = new List<string>();
}

public static class NotesWindowBrandingProbe {
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int length);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wParam,
        IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")]
    private static extern IntPtr GetClassLongPtr64(IntPtr hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "GetClassLongW")]
    private static extern uint GetClassLong32(IntPtr hwnd, int index);
    [DllImport("shell32.dll", PreserveSig = true)]
    private static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid,
        [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PropVariant value);

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey {
        public Guid FormatId;
        public uint PropertyId;
        public PropertyKey(uint id) {
            FormatId = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
            PropertyId = id;
        }
    }
    // PROPVARIANT is 24 bytes on the 64-bit Windows builds used by this app.
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropVariant {
        [FieldOffset(0)] public ushort VariantType;
        [FieldOffset(8)] public IntPtr Pointer;
    }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),
        InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
        [PreserveSig] int Commit();
    }

    private static string ReadProperty(IPropertyStore store, uint id) {
        PropertyKey key = new PropertyKey(id);
        PropVariant value = new PropVariant();
        try {
            Marshal.ThrowExceptionForHR(store.GetValue(ref key, out value));
            if (value.VariantType == 0 || value.VariantType == 1) return null;
            if (value.VariantType == 31) return Marshal.PtrToStringUni(value.Pointer);
            if (value.VariantType == 8) return Marshal.PtrToStringBSTR(value.Pointer);
            return "[VARIANT type " + value.VariantType + "]";
        } finally { PropVariantClear(ref value); }
    }
    private static IntPtr ReadIcon(IntPtr hwnd, bool large, out string source) {
        IntPtr icon;
        // SMTO_ABORTIFHUNG limits this diagnostic's effect on an unresponsive app.
        SendMessageTimeout(hwnd, 0x007F, new IntPtr(large ? 1 : 0), IntPtr.Zero,
            0x0002, 500, out icon);
        source = large ? "WM_GETICON/ICON_BIG" : "WM_GETICON/ICON_SMALL";
        if (icon == IntPtr.Zero && !large) {
            SendMessageTimeout(hwnd, 0x007F, new IntPtr(2), IntPtr.Zero,
                0x0002, 500, out icon);
            source = "WM_GETICON/ICON_SMALL2";
        }
        if (icon == IntPtr.Zero) {
            int index = large ? -14 : -34;
            icon = IntPtr.Size == 8 ? GetClassLongPtr64(hwnd, index)
                : new IntPtr(unchecked((int)GetClassLong32(hwnd, index)));
            source = large ? "class/GCLP_HICON" : "class/GCLP_HICONSM";
        }
        if (icon == IntPtr.Zero) source = "none";
        return icon;
    }
    private static string SaveIcon(IntPtr icon, string path) {
        if (icon == IntPtr.Zero) return null;
        // The HICON belongs to the target app: clone it and never DestroyIcon it.
        using (Icon owned = (Icon)Icon.FromHandle(icon).Clone())
        using (Bitmap bitmap = owned.ToBitmap()) bitmap.Save(path, ImageFormat.Png);
        return path;
    }
    public static NotesWindowBrandingRecord[] Read(int[] processIds, string directory, long windowHandle) {
        HashSet<int> targets = new HashSet<int>(processIds);
        List<NotesWindowBrandingRecord> results = new List<NotesWindowBrandingRecord>();
        EnumWindowsProc callback = delegate(IntPtr hwnd, IntPtr unused) {
            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            if (!targets.Contains((int)processId)) return true;
            StringBuilder className = new StringBuilder(256);
            GetClassName(hwnd, className, className.Capacity);
            if (!className.ToString().StartsWith("Chrome_WidgetWin_", StringComparison.Ordinal)) return true;
            NotesWindowBrandingRecord record = new NotesWindowBrandingRecord();
            record.ProcessId = (int)processId;
            record.Handle = "0x" + hwnd.ToInt64().ToString("X");
            record.Visible = IsWindowVisible(hwnd);
            record.ClassName = className.ToString();
            IPropertyStore store = null;
            try {
                Guid iid = typeof(IPropertyStore).GUID;
                Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(hwnd, ref iid, out store));
                record.AppUserModelId = ReadProperty(store, 5);
                record.RelaunchCommand = ReadProperty(store, 2);
                record.RelaunchIconResource = ReadProperty(store, 3);
                record.RelaunchDisplayNameResource = ReadProperty(store, 4);
            } catch (Exception error) { record.Errors.Add("properties: " + error.Message); }
            finally { if (store != null) Marshal.ReleaseComObject(store); }
            try {
                string source;
                IntPtr icon = ReadIcon(hwnd, true, out source);
                record.LargeIconSource = source;
                record.LargeIconPath = SaveIcon(icon, Path.Combine(directory,
                    processId + "-" + hwnd.ToInt64().ToString("X") + "-large.png"));
                icon = ReadIcon(hwnd, false, out source);
                record.SmallIconSource = source;
                record.SmallIconPath = SaveIcon(icon, Path.Combine(directory,
                    processId + "-" + hwnd.ToInt64().ToString("X") + "-small.png"));
            } catch (Exception error) { record.Errors.Add("icons: " + error.Message); }
            results.Add(record);
            return true;
        };
        if (windowHandle != 0) {
            uint owner;
            GetWindowThreadProcessId(new IntPtr(windowHandle), out owner);
            if (!targets.Contains((int)owner)) throw new InvalidOperationException(
                "The explicit window handle belongs to process " + owner + ", not a requested target.");
            callback(new IntPtr(windowHandle), IntPtr.Zero);
        }
        else EnumWindows(callback, IntPtr.Zero);
        GC.KeepAlive(callback);
        return results.ToArray();
    }
}
'@
}
$notesWindowBranding = @([NotesWindowBrandingProbe]::Read([int[]]$notesTargets.Id, $notesOutputPath, $WindowHandle))
$notesReportPath = Join-Path $notesOutputPath 'window-branding.json'
ConvertTo-Json -InputObject $notesWindowBranding -Depth 5 | Set-Content -LiteralPath $notesReportPath -Encoding UTF8
$notesWindowBranding
