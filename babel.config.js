module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"], // includes expo-router support in SDK ≥50
    plugins: [
      [
        "module:react-native-dotenv",
        {
          moduleName: "@env",
          path: ".env",
          allowUndefined: true, // optional, but avoids hard crash if missing
          safe: false
        }
      ],
      "react-native-reanimated/plugin" // must remain last
    ],
  };
};
