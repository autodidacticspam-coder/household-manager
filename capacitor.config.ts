import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.household.manager',
  appName: 'Household Manager',
  webDir: 'out',

  // Use the live server URL during development
  // Comment this out and use 'out' directory for production builds
  server: {
    url: 'https://household-manager-two.vercel.app',
    cleartext: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#ffffff',
    },
  },

  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Household Manager',
  },
};

export default config;
