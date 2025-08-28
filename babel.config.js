module.exports = function (api) {
	api.cache(true);
	return {
		presets: ['babel-preset-expo'],
		plugins: [
			'expo-router/babel',
			// NOTE: This must be last in the plugins array per Reanimated docs
			'react-native-reanimated/plugin',
		],
	};
};

