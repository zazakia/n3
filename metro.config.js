const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const exclusionList = require("metro-config/private/defaults/exclusionList").default;

// Re-implementing withNativeWind to fix the ERR_UNSUPPORTED_DIR_IMPORT bug in nativewind@4
const { withCssInterop } = require("react-native-css-interop/metro");
const { cssToReactNativeRuntimeOptions } = require("nativewind/dist/metro/common.js");
const { tailwindConfig, tailwindCli } = require("nativewind/dist/metro/tailwind/index.js");

function withNativeWindFixed(config, { input, ...options } = {}) {
    if (input) input = path.resolve(input);
    const cli = tailwindCli((...args) => console.log("[NativeWind]", ...args));

    return withCssInterop(config, {
        ...cssToReactNativeRuntimeOptions,
        ...options,
        input,
        getCSSForPlatform: (platform, onChange) => {
            return cli.getCSSForPlatform({
                platform,
                input,
                onChange,
                browserslist: "last 1 version",
                browserslistEnv: "native",
            });
        },
    });
}

const config = getDefaultConfig(__dirname);

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

config.resolver.blockList = exclusionList([
    new RegExp(`^${escapeRegex(path.resolve(__dirname, 'test-results'))}(?:\\\\|/).*`),
    new RegExp(`^${escapeRegex(path.resolve(__dirname, 'playwright-report'))}(?:\\\\|/).*`),
    new RegExp(`^${escapeRegex(path.resolve(__dirname, 'coverage'))}(?:\\\\|/).*`),
    new RegExp(`^${escapeRegex(path.resolve(__dirname, 'dist'))}(?:\\\\|/).*`),
    new RegExp(`^${escapeRegex(path.resolve(__dirname, 'tmp'))}(?:\\\\|/).*`),
]);

module.exports = withNativeWindFixed(config, { input: "./global.css" });
