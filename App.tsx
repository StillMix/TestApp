import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Импортируем наши экраны
import OBDScannerScreen from './src/screens/OBDScannerScreen';
import CarKeeperScreen from './src/screens/CarKeeperScreen';

const Tab = createBottomTabNavigator();

// Выносим компоненты иконок за пределы рендера
const ScannerIcon = ({ color }: { color: string }) => (
  <Text style={[styles.tabIcon, { color }]}>🔧</Text>
);

const CarKeeperIcon = ({ color }: { color: string }) => (
  <Text style={[styles.tabIcon, { color }]}>🚗</Text>
);

const App = () => {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: '#00ff88',
            tabBarInactiveTintColor: '#888',
          }}
        >
          <Tab.Screen
            name="Scanner"
            component={OBDScannerScreen}
            options={{
              tabBarLabel: 'OBD Сканер',
              tabBarIcon: ScannerIcon,
            }}
          />
          <Tab.Screen
            name="CarKeeper"
            component={CarKeeperScreen}
            options={{
              tabBarLabel: 'Car Keeper',
              tabBarIcon: CarKeeperIcon,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1a1a1a',
    borderTopColor: '#333',
    borderTopWidth: 1,
  },
  tabIcon: {
    fontSize: 20,
  },
});

export default App;
