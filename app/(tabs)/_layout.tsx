import { Drawer } from 'expo-router/drawer';
import { useRouter } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../src/theme';

function ChatButton() {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.chatButton}
      onPress={() => router.push('/chat')}
      activeOpacity={0.8}
    >
      <View style={styles.chatButtonInner}>
        <Ionicons name="chatbubble-ellipses" size={24} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
}

export default function DrawerLayout() {
  return (
    <View style={styles.container}>
      <Drawer
        screenOptions={({ navigation, route }: { navigation: any; route: any }) => ({
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          drawerStyle: { backgroundColor: colors.card, width: 260 },
          sceneContainerStyle: { backgroundColor: colors.bg },
          drawerLabelStyle: {
            color: colors.text,
            fontSize: 16,
            fontWeight: '600',
          },
          drawerInactiveTintColor: colors.textDim,
          drawerActiveTintColor: colors.accent,
          drawerType: 'front',
          drawerAnimationDuration: 300,
          overlayColor: 'rgba(0, 0, 0, 0.5)',
          animationEnabled: true,
          swipeEnabled: true,
          swipeEdgeWidth: 50,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => navigation.toggleDrawer()}
              style={styles.hamburgerButton}
            >
              <Ionicons name="menu" size={28} color={colors.text} />
            </TouchableOpacity>
          ),
          headerRight: () => {
            // Don't show home button on home page
            if (route.name === 'index') {
              return null;
            }
            return (
              <TouchableOpacity
                onPress={() => navigation.navigate('index')}
                style={styles.headerHomeButton}
              >
                <Ionicons name="home" size={24} color={colors.accent} />
              </TouchableOpacity>
            );
          },
        })}
      >
        <Drawer.Screen
          name="index"
          options={{
            title: 'Home',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="meal-plan"
          options={{
            title: 'Meals',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="restaurant" size={size} color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="training"
          options={{
            title: 'Train',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="barbell" size={size} color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="check-in"
          options={{
            title: 'Check-In',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="checkmark-circle" size={size} color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="profile"
          options={{
            title: 'Profile',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="settings"
          options={{
            title: 'Settings',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size} color={color} />
            ),
          }}
        />
      </Drawer>
      <ChatButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hamburgerButton: {
    paddingHorizontal: 16,
  },
  headerHomeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chatButton: {
    position: 'absolute',
    right: 20,
    bottom: 40,
    zIndex: 1000,
    pointerEvents: 'box-only',
  },
  chatButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
});

