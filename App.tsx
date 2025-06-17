import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

// Импортируем наши экраны
import OBDScannerScreen from './src/screens/OBDScannerScreen';
import CarKeeperScreen from './src/screens/CarKeeperScreen';

const Tab = createBottomTabNavigator();

const App = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#1a1a1a',
            borderTopColor: '#333',
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: '#00ff88',
          tabBarInactiveTintColor: '#888',
        }}
      >
        <Tab.Screen
          name="Scanner"
          component={OBDScannerScreen}
          options={{
            tabBarLabel: 'OBD Сканер',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 20, color }}>🔧</Text>
            ),
          }}
        />
        <Tab.Screen
          name="CarKeeper"
          component={CarKeeperScreen}
          options={{
            tabBarLabel: 'Car Keeper',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 20, color }}>🚗</Text>
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default App;
