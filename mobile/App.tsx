import 'url-polyfill';
import { StatusBar } from 'expo-status-bar';
import { ChatScreen } from './src/screens/ChatScreen';

export default function App() {
  return (
    <>
      <ChatScreen />
      <StatusBar style="dark" />
    </>
  );
}
