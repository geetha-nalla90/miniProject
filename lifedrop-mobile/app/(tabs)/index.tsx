import React from 'react';
import { WebView } from 'react-native-webview';

export default function HomeScreen() {
  return (
    <WebView
      source={{ uri: 'http://192.168.0.2:3000' }}
      style={{ flex: 1 }}
    />
  );
}