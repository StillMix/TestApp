import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  Text,
  Button,
  FlatList,
  StyleSheet,
  View,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import BleManager, { Peripheral } from 'react-native-ble-manager';
import { BluetoothDevice } from 'react-native-bluetooth-classic';

let RNBluetoothClassic: any;
if (Platform.OS === 'android') {
  RNBluetoothClassic = require('react-native-bluetooth-classic').default;
}

const App = () => {
  const [devices, setDevices] = useState<(Peripheral | BluetoothDevice)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Инициализация...');

  useEffect(() => {
    if (Platform.OS === 'ios') {
      BleManager.start({ showAlert: false })
        .then(() => setStatus('BLE Manager готов'))
        .catch(e => setError('Ошибка BLE: ' + e.message));
    } else {
      setStatus('Classic Bluetooth на Android');
    }
  }, []);

  const scan = async () => {
    setError(null);
    setDevices([]);

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setError('Bluetooth разрешение не выдано');
          return;
        }
        const bonded = await RNBluetoothClassic.getBondedDevices();
        setDevices(bonded);
        setStatus(`Найдено ${bonded.length} спаренных устройств`);
      } catch (err: any) {
        setError('Ошибка Android Bluetooth: ' + err.message);
      }
    } else {
      try {
        await BleManager.scan([], 5, true);
        setStatus('Сканирование BLE...');
        setTimeout(async () => {
          const found = await BleManager.getDiscoveredPeripherals();
          setDevices(found);
          setStatus(`Найдено BLE: ${found.length} устройств`);
        }, 5000);
      } catch (err: any) {
        setError('Ошибка BLE: ' + err.message);
      }
    }
  };

  const showConnected = async () => {
    setError(null);
    setDevices([]);

    if (Platform.OS === 'ios') {
      try {
        const connected = await BleManager.getConnectedPeripherals([]);
        setDevices(connected);
        setStatus(
          `Подключено устройств (в рамках сессии): ${connected.length}`,
        );
      } catch (err: any) {
        setError('Ошибка получения подключённых BLE: ' + err.message);
      }
    } else {
      try {
        const connected = await RNBluetoothClassic.getConnectedDevices();
        setDevices(connected);
        setStatus(`Classic подключено: ${connected.length}`);
      } catch (err: any) {
        setError('Ошибка Android Bluetooth: ' + err.message);
      }
    }
  };

  const showConnectedByUUIDs = async () => {
    setError(null);
    setDevices([]);

    if (Platform.OS !== 'ios') {
      setError('Этот метод доступен только на iOS');
      return;
    }

    const uuids = [
      '180D', // Heart Rate
      '180F', // Battery
      '180A', // Device Info
    ];

    try {
      const connected = await BleManager.getConnectedPeripherals(uuids);
      setDevices(connected);
      setStatus(`Подключено по UUID: ${connected.length} устройств`);
    } catch (err: any) {
      setError('Ошибка при запросе по UUID: ' + err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>📡 Bluetooth Сканер</Text>
      <Text>{Platform.OS === 'ios' ? 'BLE (iOS)' : 'Classic (Android)'}</Text>
      <Text style={styles.status}>{status}</Text>
      {error && <Text style={styles.error}>❌ {error}</Text>}

      <View style={styles.button}>
        <Button title="Сканировать устройства" onPress={scan} />
      </View>
      <View style={styles.button}>
        <Button
          title="Показать подключённые устройства"
          onPress={showConnected}
        />
      </View>
      <View style={styles.button}>
        <Button
          title="Показать подключённые по UUID"
          onPress={showConnectedByUUIDs}
        />
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item, index) =>
          (item as Peripheral)?.id ??
          (item as BluetoothDevice)?.address ??
          index.toString()
        }
        renderItem={({ item }) => (
          <Text style={styles.device}>
            {(item as Peripheral).name ??
              (item as BluetoothDevice).name ??
              'Без имени'}{' '}
            — {(item as Peripheral).id ?? (item as BluetoothDevice).address}
          </Text>
        )}
      />

      {devices.length === 0 && !error && (
        <Text style={{ marginTop: 20, color: '#666' }}>
          Устройства не найдены. Попробуйте сканировать или подключиться.
        </Text>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  status: { marginBottom: 8 },
  error: { color: 'red', marginVertical: 10 },
  device: { fontSize: 16, paddingVertical: 4 },
  button: { marginVertical: 10 },
});

export default App;
