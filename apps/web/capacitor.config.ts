import type { CapacitorConfig } from '@capacitor/cli';

// Envoltorio nativo (APK). La app web se sirve desde el paquete en https://localhost (sin servidor externo).
const config: CapacitorConfig = {
  appId: 'com.pitchside.manager',
  appName: 'Pitchside Manager',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  backgroundColor: '#0d1015',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0d1015', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#12161d', overlaysWebView: false },
  },
};

export default config;
