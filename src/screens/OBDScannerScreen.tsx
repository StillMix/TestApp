import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  Animated,
  PermissionsAndroid,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import BleManager from 'react-native-ble-manager';

interface BluetoothDevice {
  id: string;
  name?: string;
  rssi?: number;
}

interface ActionButtonProps {
  title: string;
  icon: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

const ActionButton: React.FC<ActionButtonProps> = ({
  title,
  icon,
  onPress,
  variant = 'primary',
}) => (
  <TouchableOpacity
    style={[
      styles.actionButton,
      variant === 'primary' && styles.primaryButton,
      variant === 'secondary' && styles.secondaryButton,
      variant === 'danger' && styles.dangerButton,
    ]}
    onPress={onPress}
  >
    <Text style={[styles.actionButtonIcon]}>{icon}</Text>
    <Text
      style={[
        styles.actionButtonText,
        variant === 'primary' && styles.primaryButtonText,
        variant === 'secondary' && styles.secondaryButtonText,
        variant === 'danger' && styles.dangerButtonText,
      ]}
    >
      {title}
    </Text>
  </TouchableOpacity>
);

const OBDScannerScreen: React.FC = () => {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Готов к сканированию');
  const [command, setCommand] = useState<string>('');
  const [responses, setResponses] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanAnimation] = useState(new Animated.Value(0));
  const [pulseAnimation] = useState(new Animated.Value(1));

  const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

  // Управление анимацией сканирования
  const startScanAnimation = useCallback(() => {
    scanAnimation.setValue(0);
    Animated.loop(
      Animated.timing(scanAnimation, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: false,
      }),
    ).start();
  }, [scanAnimation]);

  const stopScanAnimation = useCallback(() => {
    scanAnimation.stopAnimation();
    scanAnimation.setValue(0);
  }, [scanAnimation]);

  // Анимация пульса для статуса подключения
  useEffect(() => {
    const startPulseAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    };

    startPulseAnimation();
  }, [pulseAnimation]);

  const addResponse = useCallback((response: string) => {
    setResponses(prev => [
      ...prev.slice(-50), // Последние 50 сообщений
      `${new Date().toLocaleTimeString()}: ${response}`,
    ]);
  }, []);

  // Инициализация BLE Manager
  useEffect(() => {
    BleManager.start({ showAlert: false });

    const handleDiscoverPeripheral = (peripheral: any) => {
      if (peripheral.name && peripheral.name.includes('OBDII')) {
        setDevices(prevDevices => {
          const existingDevice = prevDevices.find(d => d.id === peripheral.id);
          if (existingDevice) {
            return prevDevices.map(d =>
              d.id === peripheral.id ? { ...d, rssi: peripheral.rssi } : d,
            );
          }
          return [
            ...prevDevices,
            {
              id: peripheral.id,
              name: peripheral.name,
              rssi: peripheral.rssi,
            },
          ];
        });
      }
    };

    const handleStopScan = () => {
      console.log('Сканирование остановлено');
      setIsScanning(false);
      stopScanAnimation();
    };

    const handleDisconnectedPeripheral = (data: any) => {
      console.log('Устройство отключено', data);
      setConnectedDevice(null);
      setIsConnected(false);
      setStatus('Отключено');
      addResponse('Устройство отключено');
    };

    const handleUpdateValueForCharacteristic = (data: any) => {
      const response = String.fromCharCode.apply(null, Array.from(data.value));
      console.log('Получен ответ:', response);
      addResponse(`OBD: ${response}`);
    };

    // ИСПРАВЛЕНО: Используем DeviceEventEmitter вместо BleManager.addListener
    const discoverListener = DeviceEventEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      handleDiscoverPeripheral,
    );
    const stopScanListener = DeviceEventEmitter.addListener(
      'BleManagerStopScan',
      handleStopScan,
    );
    const disconnectListener = DeviceEventEmitter.addListener(
      'BleManagerDisconnectPeripheral',
      handleDisconnectedPeripheral,
    );
    const updateValueListener = DeviceEventEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      handleUpdateValueForCharacteristic,
    );

    return () => {
      // ИСПРАВЛЕНО: Удаляем listeners правильным способом
      discoverListener.remove();
      stopScanListener.remove();
      disconnectListener.remove();
      updateValueListener.remove();
    };
  }, [addResponse, stopScanAnimation]);

  // Запрос разрешений для Android
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      if (
        granted['android.permission.BLUETOOTH_SCAN'] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.BLUETOOTH_CONNECT'] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.ACCESS_FINE_LOCATION'] ===
          PermissionsAndroid.RESULTS.GRANTED
      ) {
        console.log('Разрешения получены');
        return true;
      } else {
        console.log('Разрешения не получены');
        return false;
      }
    }
    return true;
  };

  // Сканирование устройств
  const scanForDevices = async () => {
    if (isScanning) {
      BleManager.stopScan();
      return;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      Alert.alert('Ошибка', 'Необходимые разрешения не предоставлены');
      return;
    }

    setDevices([]);
    setStatus('Сканирование...');
    setIsScanning(true);
    startScanAnimation();

    try {
      await BleManager.scan([], 10, true);
      addResponse('Начато сканирование Bluetooth устройств');
    } catch (error) {
      console.log('Ошибка сканирования:', error);
      setStatus('Ошибка сканирования');
      setIsScanning(false);
      stopScanAnimation();
    }
  };

  // Подключение к устройству
  const connectToDevice = async (deviceId: string) => {
    try {
      setStatus('Подключение...');
      await BleManager.connect(deviceId);
      setConnectedDevice(deviceId);
      setIsConnected(true);
      setStatus('Подключено');
      addResponse(`Подключено к устройству: ${deviceId}`);

      // Получение сервисов
      setTimeout(async () => {
        try {
          const peripheralInfo = await BleManager.retrieveServices(deviceId);
          console.log('Информация об устройстве:', peripheralInfo);
          addResponse('Получена информация об устройстве');

          // Запуск уведомлений
          await BleManager.startNotification(deviceId, SERVICE_UUID, TX_UUID);
          addResponse('Уведомления активированы');
        } catch (error) {
          console.log('Ошибка настройки:', error);
          addResponse(`Ошибка настройки: ${error}`);
        }
      }, 1000);
    } catch (error) {
      console.log('Ошибка подключения:', error);
      setStatus('Ошибка подключения');
      addResponse(`Ошибка подключения: ${error}`);
    }
  };

  // Отправка команды
  const sendCommand = async () => {
    if (!connectedDevice || !command.trim()) {
      return;
    }

    try {
      const commandWithCR = command + '\r';
      const data = Array.from(commandWithCR).map(char => char.charCodeAt(0));

      await BleManager.write(connectedDevice, SERVICE_UUID, RX_UUID, data);
      addResponse(`Отправлено: ${command}`);
      setCommand('');
    } catch (error) {
      console.log('Ошибка отправки:', error);
      addResponse(`Ошибка отправки: ${error}`);
    }
  };

  // Быстрый тест
  const runQuickTest = async () => {
    if (!connectedDevice) return;

    const commands = ['ATZ', 'ATE0', 'ATL1', '01 00'];
    for (const cmd of commands) {
      setCommand(cmd);
      await sendCommand();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  // Отключение
  const disconnectDevice = async () => {
    if (connectedDevice) {
      try {
        await BleManager.disconnect(connectedDevice);
        setConnectedDevice(null);
        setIsConnected(false);
        setStatus('Отключено');
        addResponse('Устройство отключено');
      } catch (error) {
        console.log('Ошибка отключения:', error);
      }
    }
  };

  // Рендер элемента устройства
  const renderDevice = ({ item }: { item: BluetoothDevice }) => (
    <View style={styles.deviceCard}>
      <View style={styles.deviceHeader}>
        <View style={styles.deviceIcon}>
          <Text style={styles.deviceIconText}>🚗</Text>
        </View>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>
            {item.name || 'Неизвестное устройство'}
          </Text>
          <Text style={styles.deviceId}>{item.id}</Text>
          {item.rssi && (
            <Text style={styles.deviceRssi}>Сигнал: {item.rssi} dBm</Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={styles.connectButton}
        onPress={() => connectToDevice(item.id)}
      >
        <Text style={styles.connectButtonText}>Подключить</Text>
      </TouchableOpacity>
    </View>
  );

  const scanInterpolation = scanAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ИСПРАВЛЕНО: Вынесли стили для backgroundColor в переменную
  const getStatusBackgroundColor = () => {
    if (isConnected) return '#00ff88';
    if (isScanning) return '#ffaa00';
    return '#666';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🔧 OBD2 Сканер</Text>
        <Text style={styles.subtitle}>ELM327 Bluetooth LE Scanner</Text>

        {/* Status */}
        <View style={styles.statusContainer}>
          <Animated.View
            style={[
              styles.statusIndicator,
              {
                backgroundColor: getStatusBackgroundColor(),
                transform: [{ scale: isConnected ? pulseAnimation : 1 }],
              },
            ]}
          />
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {/* Header Controls */}
        <View style={styles.headerControls}>
          <TouchableOpacity
            style={styles.headerScanButton}
            onPress={scanForDevices}
          >
            <Text style={styles.headerScanButtonText}>
              {isScanning ? '⏹️ Остановить' : '🔍 Сканировать'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content - здесь должен быть остальной контент */}
      {!isConnected ? (
        // Список устройств
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Найденные устройства:</Text>
          <FlatList
            data={devices}
            renderItem={renderDevice}
            keyExtractor={item => item.id}
            style={styles.deviceList}
          />
        </View>
      ) : (
        // Интерфейс для подключенного устройства
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Управление OBD2</Text>

          <View style={styles.commandSection}>
            <TextInput
              style={styles.commandInput}
              placeholder="Введите OBD команду (например: 01 00)"
              value={command}
              onChangeText={setCommand}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendCommand}>
              <Text style={styles.sendButtonText}>Отправить</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.quickActions}>
            <ActionButton
              title="Быстрый тест"
              icon="⚡"
              onPress={runQuickTest}
              variant="secondary"
            />
            <ActionButton
              title="Отключить"
              icon="🔌"
              onPress={disconnectDevice}
              variant="danger"
            />
          </View>

          <ScrollView style={styles.responseContainer}>
            <Text style={styles.responsesTitle}>Ответы:</Text>
            {responses.map((response, index) => (
              <Text key={index} style={styles.responseText}>
                {response}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
};

// Добавляем базовые стили (добавьте остальные стили по необходимости)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2196F3',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 15,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 16,
  },
  headerControls: {
    width: '100%',
  },
  headerScanButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  headerScanButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  deviceList: {
    flex: 1,
  },
  deviceCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceIconText: {
    fontSize: 24,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  deviceRssi: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: '#4CAF50',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  connectButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  commandSection: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  commandInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    backgroundColor: 'white',
  },
  sendButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    minWidth: 80,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
  },
  secondaryButton: {
    backgroundColor: '#FF9800',
  },
  dangerButton: {
    backgroundColor: '#F44336',
  },
  actionButtonIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: 'white',
  },
  secondaryButtonText: {
    color: 'white',
  },
  dangerButtonText: {
    color: 'white',
  },
  responseContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
  },
  responsesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  responseText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
});

export default OBDScannerScreen;
