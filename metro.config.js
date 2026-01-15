// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for font files
config.resolver.assetExts.push('ttf', 'otf', 'woff', 'woff2');

module.exports = config;
