import React from 'react';
import { WebView } from 'react-native-webview';

export default function HomeScreen() {
  return (
    <WebView
      source={{ uri: 'http://10.64.247.190:3000' }}
      style={{ flex: 1 }}
    />
  );
}