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
  Alert,
} from 'react-native';
import BleManager, { Peripheral } from 'react-native-ble-manager';
import { BluetoothDevice } from 'react-native-bluetooth-classic';

let RNBluetoothClassic: any;
if (Platform.OS === 'android') {
  RNBluetoothClassic = require('react-native-bluetooth-classic').default;
}

const App: React.FC = () => {
  const [devices, setDevices] = useState<(Peripheral | BluetoothDevice)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Инициализация...');
  const [bluetoothState, setBluetoothState] = useState('unknown');

  useEffect(() => {
    if (Platform.OS === 'ios') {
      initializeBLE();
    } else {
      setStatus('Classic Bluetooth на Android');
    }
  }, []);

  const initializeBLE = async () => {
    try {
      await BleManager.start({ showAlert: false });

      // Проверяем состояние Bluetooth
      const isEnabled = await BleManager.checkState();
      console.log('Bluetooth состояние:', isEnabled);
      setBluetoothState(isEnabled);

      if (isEnabled === 'on') {
        setStatus('✅ BLE Manager готов, Bluetooth включен');
      } else {
        setStatus('❌ Bluetooth выключен - включите в настройках');
        setError('Включите Bluetooth в настройках iPhone');
      }
    } catch (err: any) {
      setError('Ошибка BLE: ' + err.message);
      console.error('BLE Error:', err);
    }
  };

  const checkBluetoothState = async () => {
    if (Platform.OS === 'ios') {
      try {
        const state = await BleManager.checkState();
        setBluetoothState(state);
        Alert.alert('Состояние Bluetooth', `Текущее состояние: ${state}`);
      } catch (catchError: any) {
        setError('Ошибка проверки состояния: ' + catchError.message);
      }
    }
  };

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
        // Проверяем состояние перед сканированием
        const state = await BleManager.checkState();
        if (state !== 'on') {
          setError('Bluetooth должен быть включен для сканирования');
          return;
        }

        setStatus('🔍 Начинаем BLE сканирование...');
        console.log('Starting BLE scan...');

        // Увеличиваем время сканирования и разрешаем дубликаты
        await BleManager.scan([], 10, true);

        setTimeout(async () => {
          try {
            const found = await BleManager.getDiscoveredPeripherals();
            console.log('Found devices:', found);
            setDevices(found);
            setStatus(`✅ Найдено BLE устройств: ${found.length}`);

            if (found.length === 0) {
              setStatus(
                '❌ BLE устройства не найдены. Убедитесь что поблизости есть BLE устройства в режиме обнаружения.',
              );
            }
          } catch (fetchError: any) {
            setError('Ошибка получения устройств: ' + fetchError.message);
          }
        }, 10000);
      } catch (err: any) {
        setError('Ошибка BLE сканирования: ' + err.message);
        console.error('Scan error:', err);
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

        if (connected.length === 0) {
          setStatus(
            'Нет подключенных BLE устройств в текущей сессии приложения',
          );
        }
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

    // Расширенный список UUID для CAN и автомобильных устройств
    const uuids = [
      '180D', // Heart Rate (для тестирования)
      '180F', // Battery
      '180A', // Device Info
      'FFF0', // Некоторые CAN адаптеры
      '6E400001-B5A3-F393-E0A9-E50E24DCCA9E', // Nordic UART Service
    ];

    try {
      const connected = await BleManager.getConnectedPeripherals(uuids);
      setDevices(connected);
      setStatus(`Подключено по CAN/Auto UUID: ${connected.length} устройств`);
    } catch (err: any) {
      setError('Ошибка при запросе по UUID: ' + err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>📡 Bluetooth Сканер для CAN</Text>
      <Text>{Platform.OS === 'ios' ? 'BLE (iOS)' : 'Classic (Android)'}</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.bluetoothState}>Bluetooth: {bluetoothState}</Text>
      {error && <Text style={styles.error}>❌ {error}</Text>}

      <View style={styles.button}>
        <Button title="🔍 Сканировать BLE устройства" onPress={scan} />
      </View>
      <View style={styles.button}>
        <Button title="📱 Показать подключённые" onPress={showConnected} />
      </View>
      <View style={styles.button}>
        <Button title="🚗 Поиск по CAN UUID" onPress={showConnectedByUUIDs} />
      </View>
      <View style={styles.button}>
        <Button
          title="⚙️ Проверить состояние Bluetooth"
          onPress={checkBluetoothState}
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
          <View style={styles.deviceContainer}>
            <Text style={styles.deviceName}>
              {(item as Peripheral).name ??
                (item as BluetoothDevice).name ??
                'Без имени'}
            </Text>
            <Text style={styles.deviceId}>
              ID: {(item as Peripheral).id ?? (item as BluetoothDevice).address}
            </Text>
            {(item as Peripheral).rssi && (
              <Text style={styles.deviceRssi}>
                Сигнал: {(item as Peripheral).rssi} dBm
              </Text>
            )}
          </View>
        )}
      />

      {devices.length === 0 && !error && (
        <View style={styles.helpContainer}>
          <Text style={styles.helpTitle}>💡 Советы для поиска устройств:</Text>
          <Text style={styles.helpText}>
            • Убедитесь что Bluetooth включен{'\n'}• Для CAN нужны BLE-адаптеры
            (не классический Bluetooth){'\n'}• Попробуйте найти любые BLE
            устройства поблизости{'\n'}• Проверьте что устройство в режиме
            обнаружения{'\n'}• На iOS недоступен классический Bluetooth SPP
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 12, color: '#333' },
  status: { marginBottom: 8, fontSize: 16, color: '#666' },
  bluetoothState: {
    marginBottom: 8,
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  error: {
    color: 'red',
    marginVertical: 10,
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 5,
  },
  button: { marginVertical: 6 },
  deviceContainer: {
    backgroundColor: 'white',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#333' },
  deviceId: { fontSize: 14, color: '#666', marginTop: 2 },
  deviceRssi: { fontSize: 12, color: '#999', marginTop: 2 },
  helpContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  helpText: { fontSize: 14, color: '#424242', lineHeight: 20 },
});
export default App;
