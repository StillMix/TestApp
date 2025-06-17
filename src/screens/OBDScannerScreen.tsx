import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
  Animated,
  PermissionsAndroid,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
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
            toValue: 1.2,
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

    if (isConnected) {
      startPulseAnimation();
    } else {
      pulseAnimation.setValue(1);
    }
  }, [isConnected, pulseAnimation]);

  // Инициализация BLE
  useEffect(() => {
    initializeBLE();
    return () => {
      BleManager.stopScan();
    };
  }, []);

  const initializeBLE = async () => {
    try {
      await BleManager.start({ showAlert: false });
      console.log('BLE Manager инициализирован');

      if (Platform.OS === 'android') {
        await requestBluetoothPermissions();
      }
    } catch (error) {
      console.error('Ошибка инициализации BLE:', error);
      setStatus('Ошибка инициализации Bluetooth');
    }
  };

  const requestBluetoothPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        console.log('Разрешения получены:', granted);
      } catch (error) {
        console.error('Ошибка получения разрешений:', error);
      }
    }
  };

  const startScan = async () => {
    if (isScanning) {
      stopScan();
      return;
    }

    try {
      setDevices([]);
      setIsScanning(true);
      setStatus('Сканирование...');
      startScanAnimation();

      const handleDiscoverPeripheral = (peripheral: any) => {
        if (peripheral.name) {
          setDevices(current => {
            const exists = current.find(device => device.id === peripheral.id);
            if (!exists) {
              return [
                ...current,
                {
                  id: peripheral.id,
                  name: peripheral.name,
                  rssi: peripheral.rssi,
                },
              ];
            }
            return current;
          });
        }
      };

      DeviceEventEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        handleDiscoverPeripheral,
      );

      await BleManager.scan([], 30, false);

      setTimeout(() => {
        stopScan();
      }, 30000);
    } catch (error) {
      console.error('Ошибка сканирования:', error);
      setStatus('Ошибка сканирования');
      setIsScanning(false);
      stopScanAnimation();
    }
  };

  const stopScan = () => {
    BleManager.stopScan();
    setIsScanning(false);
    setStatus('Сканирование завершено');
    stopScanAnimation();
    DeviceEventEmitter.removeAllListeners('BleManagerDiscoverPeripheral');
  };

  const connectToDevice = async (deviceId: string, deviceName?: string) => {
    try {
      setStatus(`Подключение к ${deviceName || deviceId}...`);
      await BleManager.connect(deviceId);
      await BleManager.retrieveServices(deviceId);

      setConnectedDevice(deviceId);
      setIsConnected(true);
      setStatus(`Подключено к ${deviceName || deviceId}`);

      Alert.alert('Успех', `Подключено к ${deviceName || deviceId}`);
    } catch (error) {
      console.error('Ошибка подключения:', error);
      setStatus('Ошибка подключения');
      Alert.alert('Ошибка', 'Не удалось подключиться к устройству');
    }
  };

  const disconnectDevice = async () => {
    if (connectedDevice) {
      try {
        await BleManager.disconnect(connectedDevice);
        setConnectedDevice(null);
        setIsConnected(false);
        setStatus('Отключено');
        setResponses([]);
        Alert.alert('Успех', 'Устройство отключено');
      } catch (error) {
        console.error('Ошибка отключения:', error);
        Alert.alert('Ошибка', 'Не удалось отключиться');
      }
    }
  };

  const sendCommand = async () => {
    if (!connectedDevice || !command.trim()) {
      Alert.alert('Ошибка', 'Введите команду для отправки');
      return;
    }

    try {
      const commandWithCR = command.trim() + '\r';
      const data = Array.from(commandWithCR, char => char.charCodeAt(0));

      await BleManager.write(connectedDevice, SERVICE_UUID, RX_UUID, data);

      setResponses(current => [
        ...current,
        `> ${command}`,
        'Команда отправлена...',
      ]);
      setCommand('');

      // Здесь должна быть логика чтения ответа
      setTimeout(() => {
        setResponses(current => [...current, 'Ответ получен (пример)']);
      }, 1000);
    } catch (error) {
      console.error('Ошибка отправки команды:', error);
      setResponses(current => [...current, `Ошибка: ${error}`]);
    }
  };

  const runQuickTest = () => {
    setCommand('01 00');
    sendCommand();
  };

  const renderDevice = ({ item }: { item: BluetoothDevice }) => (
    <View style={styles.deviceItem}>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>
          {item.name || 'Неизвестное устройство'}
        </Text>
        <Text style={styles.deviceId}>{item.id}</Text>
        {item.rssi && (
          <Text style={styles.deviceRssi}>RSSI: {item.rssi} dBm</Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.connectButton}
        onPress={() => connectToDevice(item.id, item.name)}
      >
        <Text style={styles.connectButtonText}>Подключить</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Animated.View
          style={[
            styles.statusContainer,
            isConnected && {
              transform: [{ scale: pulseAnimation }],
            },
          ]}
        >
          <Text style={[styles.status, isConnected && styles.connectedStatus]}>
            {status}
          </Text>
        </Animated.View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.scanButton, isScanning && styles.scanButtonActive]}
            onPress={startScan}
            disabled={isConnected}
          >
            <Text style={styles.scanButtonText}>
              {isScanning ? '⏹️ Остановить' : '🔍 Сканировать'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content с KeyboardAwareScrollView */}
      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        enableAutomaticScroll={true}
        enableOnAndroid={true}
        extraScrollHeight={100}
        keyboardOpeningTime={250}
        keyboardShouldPersistTaps="handled"
        resetScrollToCoords={{ x: 0, y: 0 }}
      >
        {!isConnected ? (
          // Список устройств
          <View>
            <Text style={styles.sectionTitle}>Найденные устройства:</Text>
            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={item => item.id}
              style={styles.deviceList}
              scrollEnabled={false} // Отключаем скролл у FlatList, так как используем KeyboardAwareScrollView
            />
          </View>
        ) : (
          // Интерфейс для подключенного устройства
          <View>
            <Text style={styles.sectionTitle}>Управление OBD2</Text>

            <View style={styles.commandSection}>
              <TextInput
                style={styles.commandInput}
                placeholder="Введите OBD команду (например: 01 00)"
                value={command}
                onChangeText={setCommand}
                autoCapitalize="characters"
                placeholderTextColor="#999"
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

            <View style={styles.responseContainer}>
              <Text style={styles.responsesTitle}>Ответы:</Text>
              {responses.map((response, index) => (
                <Text key={index} style={styles.responseText}>
                  {response}
                </Text>
              ))}
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  status: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  connectedStatus: {
    color: '#00ff88',
  },
  controls: {
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: '#333',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#555',
  },
  scanButtonActive: {
    backgroundColor: '#ff6b6b',
    borderColor: '#ff6b6b',
  },
  scanButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 20,
  },
  sectionTitle: {
    color: '#00ff88',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  deviceList: {
    flexGrow: 0,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
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
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
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
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    minHeight: 200,
  },
  responsesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#00ff88',
  },
  responseText: {
    fontSize: 12,
    color: '#ffffff',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
});

export default OBDScannerScreen;
