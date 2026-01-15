module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // expo-router plugin is automatically included by babel-preset-expo
      // react-native-reanimated plugin must be last
      'react-native-reanimated/plugin',
    ],
  };
};

