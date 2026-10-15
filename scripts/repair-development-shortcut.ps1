param(
  [string]$ShortcutPath = (Join-Path ([Environment]::GetFolderPath('Programs')) 'Electron.lnk'),
  [string]$BackupDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.cache\shortcut-backups')
)
$ErrorActionPreference = 'Stop'
$notesProjectDirectory = Split-Path -Parent $PSScriptRoot
$notesDevelopmentExe = [IO.Path]::GetFullPath((Join-Path $notesProjectDirectory 'node_modules\electron\dist\electron.exe'))
$notesProductionAppId = 'com.notesforwindows.desktop'
$notesDevelopmentAppId = 'com.notesforwindows.development'
if (-not (Test-Path -LiteralPath $ShortcutPath -PathType Leaf)) {
  return [pscustomobject]@{ Repaired = $false; Reason = 'No development shortcut' }
}
$notesResolvedLink = (Get-Item -LiteralPath $ShortcutPath).FullName
$notesShell = New-Object -ComObject WScript.Shell
$notesShortcut = $notesShell.CreateShortcut($notesResolvedLink)
if (-not [string]::Equals($notesShortcut.TargetPath, $notesDevelopmentExe, [StringComparison]::OrdinalIgnoreCase)) {
  return [pscustomobject]@{ Repaired = $false; Reason = 'Shortcut belongs to another application' }
}
if (-not ('NotesDevelopmentShortcutIdentity' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NotesDevelopmentShortcutIdentity {
    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey {
        public Guid FormatId;
        public uint PropertyId;
        public PropertyKey(uint id) {
            FormatId = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
            PropertyId = id;
        }
    }
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropVariant {
        [FieldOffset(0)] public ushort VariantType;
        [FieldOffset(8)] public IntPtr Pointer;
    }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
        [PreserveSig] int Commit();
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    private static extern int SHGetPropertyStoreFromParsingName(string path, IntPtr binding, uint flags,
        ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PropVariant value);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern void SHChangeNotify(uint eventId, uint flags, string item, IntPtr unused);
    public static string Read(string path) {
        return Update(path, null, null);
    }
    public static string Update(string path, string expected, string replacement) {
        IPropertyStore store;
        Guid iid = typeof(IPropertyStore).GUID;
        Marshal.ThrowExceptionForHR(SHGetPropertyStoreFromParsingName(path, IntPtr.Zero,
            replacement == null ? 0u : 2u, ref iid, out store));
        PropertyKey key = new PropertyKey(5);
        PropVariant original = new PropVariant();
        try {
            Marshal.ThrowExceptionForHR(store.GetValue(ref key, out original));
            string value = original.VariantType == 31 ? Marshal.PtrToStringUni(original.Pointer) : null;
            if (replacement == null || !String.Equals(value, expected, StringComparison.Ordinal)) return value;
            PropVariant updated = new PropVariant();
            updated.VariantType = 31;
            updated.Pointer = Marshal.StringToCoTaskMemUni(replacement);
            try {
                Marshal.ThrowExceptionForHR(store.SetValue(ref key, ref updated));
                Marshal.ThrowExceptionForHR(store.Commit());
            } finally { PropVariantClear(ref updated); }
            return replacement;
        } finally {
            PropVariantClear(ref original);
            Marshal.ReleaseComObject(store);
        }
    }
    public static void Refresh(string path) {
        SHChangeNotify(0x00002000, 0x0005, path, IntPtr.Zero);
        SHChangeNotify(0x08000000, 0, null, IntPtr.Zero);
    }
}
'@
}
$notesCurrentAppId = [NotesDevelopmentShortcutIdentity]::Read($notesResolvedLink)
if ($notesCurrentAppId -ne $notesProductionAppId) {
  return [pscustomobject]@{ Repaired = $false; Reason = 'Shortcut identity is already separate'; AppUserModelId = $notesCurrentAppId }
}
[IO.Directory]::CreateDirectory([IO.Path]::GetFullPath($BackupDirectory)) | Out-Null
$notesBackup = Join-Path $BackupDirectory ('Electron-before-identity-repair-' + [Guid]::NewGuid().ToString('N') + '.lnk')
Copy-Item -LiteralPath $notesResolvedLink -Destination $notesBackup
$notesUpdatedAppId = [NotesDevelopmentShortcutIdentity]::Update($notesResolvedLink, $notesProductionAppId, $notesDevelopmentAppId)
if ($notesUpdatedAppId -ne $notesDevelopmentAppId -or [NotesDevelopmentShortcutIdentity]::Read($notesResolvedLink) -ne $notesDevelopmentAppId) {
  throw 'The development shortcut identity could not be updated. Its backup is preserved.'
}
[NotesDevelopmentShortcutIdentity]::Refresh($notesResolvedLink)
[pscustomobject]@{ Repaired = $true; Shortcut = $notesResolvedLink; AppUserModelId = $notesDevelopmentAppId; Backup = [IO.Path]::GetFullPath($notesBackup) }
