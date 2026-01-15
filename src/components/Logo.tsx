import { Image, ImageStyle } from 'react-native';

interface LogoProps {
  size?: number;
  rounded?: boolean;
}

export default function Logo({ size = 96, rounded = false }: LogoProps) {
  const style: ImageStyle = {
    width: size,
    height: size,
    resizeMode: 'contain',
    borderRadius: rounded ? 20 : 0,
  };

  return (
    <Image
      source={require('../../assets/images/sculptr-logo.png')}
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Sculptr logo"
    />
  );
}
