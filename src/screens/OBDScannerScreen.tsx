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

    BleManager.addListener(
      'BleManagerDiscoverPeripheral',
      handleDiscoverPeripheral,
    );
    BleManager.addListener('BleManagerStopScan', handleStopScan);
    BleManager.addListener(
      'BleManagerDisconnectPeripheral',
      handleDisconnectedPeripheral,
    );
    BleManager.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      handleUpdateValueForCharacteristic,
    );

    return () => {
      BleManager.removeAllListeners('BleManagerDiscoverPeripheral');
      BleManager.removeAllListeners('BleManagerStopScan');
      BleManager.removeAllListeners('BleManagerDisconnectPeripheral');
      BleManager.removeAllListeners(
        'BleManagerDidUpdateValueForCharacteristic',
      );
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
                backgroundColor: isConnected
                  ? '#00ff88'
                  : isScanning
                  ? '#ffaa00'
                  : '#666',
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

      {/* Content */}
      {!isConnected ? (
        <View style={styles.scanningContainer}>
          {isScanning && (
            <Animated.View
              style={[
                styles.scanningRing,
                {
                  transform: [{ rotate: scanInterpolation }],
                },
              ]}
            >
              <View style={styles.scanningCenter}>
                <Text style={styles.scanningIcon}>📡</Text>
              </View>
            </Animated.View>
          )}

          <TouchableOpacity style={styles.scanButton} onPress={scanForDevices}>
            <Text style={styles.scanButtonText}>
              {isScanning
                ? '⏹️ Остановить сканирование'
                : '🔍 Начать сканирование'}
            </Text>
          </TouchableOpacity>

          {/* Devices List */}
          <FlatList
            data={devices}
            renderItem={renderDevice}
            keyExtractor={item => item.id}
            style={styles.devicesList}
            showsVerticalScrollIndicator={false}
          />

          {/* Help Card */}
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>💡 Совет</Text>
            <Text style={styles.helpText}>
              Убедитесь, что ваш ELM327 адаптер включен и находится в режиме
              сопряжения. Устройство должно называться что-то вроде "OBDII" или
              "ELM327".
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.connectedContainer}>
          {/* Command Input */}
          <View style={styles.commandSection}>
            <View style={styles.commandInputContainer}>
              <TextInput
                style={styles.commandInput}
                value={command}
                onChangeText={setCommand}
                placeholder="Введите OBD команду (например: 01 00)"
                placeholderTextColor="#666"
                onSubmitEditing={sendCommand}
              />
              <TouchableOpacity style={styles.sendButton} onPress={sendCommand}>
                <Text style={styles.sendButtonText}>📤</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Actions */}
            <View style={styles.quickActions}>
              <ActionButton
                title="Быстрый тест"
                icon="⚡"
                onPress={runQuickTest}
              />
              <ActionButton
                title="Очистить лог"
                icon="🗑️"
                onPress={() => setResponses([])}
                variant="secondary"
              />
              <ActionButton
                title="Отключить"
                icon="🔌"
                onPress={disconnectDevice}
                variant="danger"
              />
            </View>
          </View>

          {/* Response Log */}
          <View style={styles.logContainer}>
            <Text style={styles.logTitle}>📊 Лог ответов</Text>
            <ScrollView
              style={styles.logScroll}
              showsVerticalScrollIndicator={false}
            >
              {responses.map((response, index) => (
                <Text key={index} style={styles.logText}>
                  {response}
                </Text>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 5,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  headerControls: {
    alignItems: 'center',
    marginTop: 10,
  },
  scanningContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  scanningRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#00ff88',
    borderTopColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
  },
  scanningCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanningIcon: {
    fontSize: 30,
  },
  scanButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 25,
    marginTop: 30,
  },
  headerScanButton: {
    backgroundColor: '#333',
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginTop: 10,
    borderRadius: 15,
  },
  scanButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  headerScanButtonText: {
    color: '#00ff88',
    fontSize: 12,
  },
  devicesList: {
    width: '100%',
    marginTop: 20,
  },
  deviceCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#00ff88',
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  deviceIconText: {
    fontSize: 20,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceId: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  deviceRssi: {
    color: '#00ff88',
    fontSize: 11,
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    alignSelf: 'flex-end',
    marginTop: 10,
  },
  connectButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  helpCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 20,
    marginTop: 20,
    width: '100%',
    borderLeftWidth: 4,
    borderLeftColor: '#ffaa00',
  },
  helpTitle: {
    color: '#ffaa00',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  helpText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  connectedContainer: {
    flex: 1,
    padding: 20,
  },
  commandSection: {
    marginBottom: 20,
  },
  commandInputContainer: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 5,
    borderWidth: 1,
    borderColor: '#333',
  },
  commandInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  sendButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    fontSize: 18,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginHorizontal: 3,
  },
  primaryButton: {
    backgroundColor: '#00ff88',
  },
  secondaryButton: {
    backgroundColor: '#333',
  },
  dangerButton: {
    backgroundColor: '#ff6b6b',
  },
  actionButtonIcon: {
    fontSize: 16,
    marginRight: 5,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#000',
  },
  secondaryButtonText: {
    color: '#ffffff',
  },
  dangerButtonText: {
    color: '#ffffff',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 15,
  },
  logTitle: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  logScroll: {
    flex: 1,
  },
  logText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'Courier',
    marginBottom: 5,
    backgroundColor: '#0a0a0a',
    padding: 8,
    borderRadius: 5,
  },
});

export default OBDScannerScreen;
