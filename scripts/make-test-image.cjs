const sharp = require("sharp");
const svg =
  '<svg width="1000" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="50" y="100" font-family="Arial" font-size="44" fill="black">NOTES FOR WINDOWS</text><text x="50" y="190" font-family="Arial" font-size="32" fill="black">Remember the meeting tomorrow.</text></svg>';
sharp(Buffer.from(svg)).png().toFile("tests/fixtures/document.png");
