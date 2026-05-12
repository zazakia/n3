import React from 'react';
import { Platform, View } from 'react-native';

type ToastOptions = {
  text1?: string;
  text2?: string;
};

const WebToast = () => <View style={{ display: 'none' }} />;

(WebToast as any).show = (options: ToastOptions) => {
  console.log('[Toast Web]', options?.text1, options?.text2);
};

(WebToast as any).hide = () => {};

let ToastComponent: any = WebToast;

if (Platform.OS !== 'web') {
  ToastComponent = require('react-native-toast-message').default;
}

export default ToastComponent;
