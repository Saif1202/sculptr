import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Link, usePathname } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';

const NAV_LINKS = [
  { href: '/(app)/dashboard', label: 'Dashboard' },
  { href: '/(app)/meal-plan', label: 'Meal Plan' },
  { href: '/(app)/training-plan', label: 'Training' },
  { href: '/(app)/check-in', label: 'Check-in' },
  { href: '/(app)/settings', label: 'Settings' },
];

export function AppHeader() {
  const pathname = usePathname();
  return (
    <View style={styles.container}>
      <Link href={"/(app)/dashboard"} asChild>
        <Pressable style={styles.logoRow}>
          <Image source={require('../assets/images/icon.png')} style={styles.logo} />
          <ThemedText type="title" style={styles.brand}>Sculptr</ThemedText>
        </Pressable>
      </Link>
      <View style={styles.nav}>
        {NAV_LINKS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} asChild>
              <Pressable style={[styles.navItem, active && styles.navItemActive]}>
                <ThemedText style={[styles.navText, active && styles.navTextActive]}> {item.label} </ThemedText>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: Colors.dark.background,
    borderBottomColor: '#142042',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  brand: {
    color: '#FFFFFF',
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: '#0F1A35',
  },
  navText: {
    color: '#A7B1C2',
  },
  navTextActive: {
    color: '#FFFFFF',
  },
});

export default AppHeader;

