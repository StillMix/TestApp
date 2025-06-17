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
  EmitterSubscription,
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

  // ELM327 Bluetooth LE UUID'ы (обычно используемые)
  const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

  // Запрос разрешений для Android
  const requestBluetoothPermissions = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        const granted = await PermissionsAndroid.requestMultiple(permissions);

        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED,
        );

        if (!allGranted) {
          Alert.alert(
            'Разрешения не получены',
            'Для работы с Bluetooth необходимы все разрешения',
          );
        }

        console.log('Разрешения получены:', granted);
      } catch (error) {
        console.error('Ошибка получения разрешений:', error);
      }
    }
  }, []);

  // Инициализация BLE - обернута в useCallback
  const initializeBLE = useCallback(async () => {
    try {
      await BleManager.start({ showAlert: false });
      console.log('BLE Manager инициализирован');

      if (Platform.OS === 'android') {
        await requestBluetoothPermissions();
      }

      setStatus('BLE инициализирован, готов к работе');
    } catch (error) {
      console.error('Ошибка инициализации BLE:', error);
      setStatus('Ошибка инициализации Bluetooth');
    }
  }, [requestBluetoothPermissions]);

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

  // Остановка сканирования
  const stopScan = useCallback(() => {
    BleManager.stopScan();
    setIsScanning(false);
    setStatus('Сканирование завершено');
    stopScanAnimation();
    DeviceEventEmitter.removeAllListeners('BleManagerDiscoverPeripheral');
  }, [stopScanAnimation]);

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

  // Инициализация BLE при монтировании компонента
  useEffect(() => {
    initializeBLE();

    return () => {
      // Очистка при размонтировании
      if (isScanning) {
        BleManager.stopScan();
      }
      DeviceEventEmitter.removeAllListeners('BleManagerDiscoverPeripheral');
    };
  }, [initializeBLE, isScanning]);

  // Отправка команды напрямую (для инициализации)
  const sendCommandDirect = useCallback(
    async (cmd: string): Promise<void> => {
      if (!connectedDevice) return;

      try {
        const commandWithCR = cmd.trim() + '\r';
        const data = Array.from(commandWithCR, char => char.charCodeAt(0));

        await BleManager.write(connectedDevice, SERVICE_UUID, RX_UUID, data);
        console.log(`Команда отправлена: ${cmd}`);
      } catch (error) {
        console.error('Ошибка отправки команды:', error);
        throw error;
      }
    },
    [connectedDevice],
  );

  // Инициализация ELM327 адаптера
  const initializeELM327 = useCallback(async () => {
    if (!connectedDevice) return;

    try {
      setResponses(current => [...current, 'Инициализация ELM327...']);

      // Последовательность команд инициализации ELM327
      const initCommands = [
        'ATZ', // Сброс
        'ATE0', // Отключить эхо
        'ATL0', // Отключить переводы строк
        'ATS0', // Отключить пробелы
        'ATH1', // Включить заголовки
        'ATSP0', // Автоматический протокол
      ];

      for (const cmd of initCommands) {
        await sendCommandDirect(cmd);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setResponses(current => [...current, 'ELM327 инициализирован!']);
      setStatus('ELM327 готов к работе');
    } catch (error) {
      console.error('Ошибка инициализации ELM327:', error);
      setResponses(current => [...current, `Ошибка инициализации: ${error}`]);
    }
  }, [connectedDevice, sendCommandDirect]);

  const startScan = useCallback(async () => {
    if (isScanning) {
      stopScan();
      return;
    }

    try {
      setDevices([]);
      setIsScanning(true);
      setStatus('Сканирование...');
      startScanAnimation();

      // Обработчик обнаружения устройств
      const handleDiscoverPeripheral = (peripheral: any) => {
        console.log('Обнаружено устройство:', peripheral);

        // Фильтрация: показываем только именованные устройства или ELM327-подобные
        if (
          peripheral.name ||
          (peripheral.advertising &&
            peripheral.advertising.localName &&
            peripheral.advertising.localName.toLowerCase().includes('elm')) ||
          peripheral.name?.toLowerCase().includes('obd')
        ) {
          setDevices(current => {
            const exists = current.find(device => device.id === peripheral.id);
            if (!exists) {
              return [
                ...current,
                {
                  id: peripheral.id,
                  name:
                    peripheral.name ||
                    peripheral.advertising?.localName ||
                    'ELM327',
                  rssi: peripheral.rssi,
                },
              ];
            }
            return current;
          });
        }
      };

      const subscription: EmitterSubscription = DeviceEventEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        handleDiscoverPeripheral,
      );

      await BleManager.scan([], 30, false);

      // Остановка сканирования через 30 секунд
      setTimeout(() => {
        stopScan();
        subscription.remove();
      }, 30000);
    } catch (error) {
      console.error('Ошибка сканирования:', error);
      setStatus('Ошибка сканирования');
      setIsScanning(false);
      stopScanAnimation();
    }
  }, [isScanning, startScanAnimation, stopScan, stopScanAnimation]);

  const connectToDevice = useCallback(
    async (deviceId: string, deviceName?: string) => {
      try {
        setStatus(`Подключение к ${deviceName || deviceId}...`);

        // Подключение к устройству
        await BleManager.connect(deviceId);
        console.log('Подключено к устройству:', deviceId);

        // Получение сервисов
        await BleManager.retrieveServices(deviceId);
        console.log('Сервисы получены');

        setConnectedDevice(deviceId);
        setIsConnected(true);
        setStatus(`Подключено к ${deviceName || deviceId}`);

        // Инициализация ELM327
        setTimeout(() => {
          initializeELM327();
        }, 1000);

        Alert.alert('Успех', `Подключено к ${deviceName || deviceId}`);
      } catch (error) {
        console.error('Ошибка подключения:', error);
        setStatus('Ошибка подключения');
        Alert.alert('Ошибка', 'Не удалось подключиться к устройству');
      }
    },
    [initializeELM327],
  );

  const disconnectDevice = useCallback(async () => {
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
  }, [connectedDevice]);

  const sendCommand = useCallback(async () => {
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

      // Здесь должна быть логика чтения ответа от ELM327
      // В реальном приложении нужно подписаться на уведомления
      setTimeout(() => {
        setResponses(current => [...current, 'Ответ: OK (пример)']);
      }, 1000);
    } catch (error) {
      console.error('Ошибка отправки команды:', error);
      setResponses(current => [...current, `Ошибка: ${error}`]);
    }
  }, [connectedDevice, command]);

  // Быстрые команды для тестирования
  const runQuickTest = useCallback(() => {
    setCommand('01 00');
    sendCommand();
  }, [sendCommand]);

  const getVIN = useCallback(() => {
    setCommand('09 02');
    sendCommand();
  }, [sendCommand]);

  const getEngineRPM = useCallback(() => {
    setCommand('01 0C');
    sendCommand();
  }, [sendCommand]);

  const getSpeed = useCallback(() => {
    setCommand('01 0D');
    sendCommand();
  }, [sendCommand]);

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

          {isConnected && (
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={disconnectDevice}
            >
              <Text style={styles.disconnectButtonText}>🔌 Отключить</Text>
            </TouchableOpacity>
          )}
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
          /* Список устройств */
          <View style={styles.deviceList}>
            <Text style={styles.sectionTitle}>Доступные устройства</Text>
            {devices.length === 0 ? (
              <Text style={styles.noDevicesText}>
                {isScanning ? 'Поиск устройств...' : 'Нет найденных устройств'}
              </Text>
            ) : (
              <FlatList
                data={devices}
                renderItem={renderDevice}
                keyExtractor={item => item.id}
                scrollEnabled={false}
              />
            )}
          </View>
        ) : (
          /* Интерфейс управления */
          <View style={styles.controlPanel}>
            {/* Быстрые действия */}
            <Text style={styles.sectionTitle}>Быстрые команды</Text>
            <View style={styles.quickActions}>
              <ActionButton
                title="Тест"
                icon="🔧"
                onPress={runQuickTest}
                variant="primary"
              />
              <ActionButton
                title="VIN"
                icon="🆔"
                onPress={getVIN}
                variant="secondary"
              />
              <ActionButton
                title="Обороты"
                icon="⚡"
                onPress={getEngineRPM}
                variant="secondary"
              />
              <ActionButton
                title="Скорость"
                icon="🏃"
                onPress={getSpeed}
                variant="secondary"
              />
            </View>

            {/* Ввод команды */}
            <Text style={styles.sectionTitle}>Ручная команда</Text>
            <View style={styles.commandSection}>
              <TextInput
                style={styles.commandInput}
                placeholder="Введите OBD команду (например: 01 00)"
                placeholderTextColor="#666"
                value={command}
                onChangeText={setCommand}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.sendButton} onPress={sendCommand}>
                <Text style={styles.sendButtonText}>📤 Отправить</Text>
              </TouchableOpacity>
            </View>

            {/* Ответы */}
            <Text style={styles.sectionTitle}>Ответы</Text>
            <View style={styles.responseContainer}>
              {responses.length === 0 ? (
                <Text style={styles.responseText}>
                  Ответы будут отображены здесь...
                </Text>
              ) : (
                responses.map((response, index) => (
                  <Text key={index} style={styles.responseText}>
                    {response}
                  </Text>
                ))
              )}
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
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  status: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  connectedStatus: {
    color: '#00ff88',
    fontWeight: 'bold',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  scanButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  scanButtonActive: {
    backgroundColor: '#FF5722',
  },
  scanButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  disconnectButton: {
    backgroundColor: '#F44336',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
  },
  disconnectButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  deviceList: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00ff88',
    marginBottom: 12,
  },
  noDevicesText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  deviceId: {
    fontSize: 12,
    color: '#999',
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
  controlPanel: {
    flex: 1,
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
    maxHeight: 300,
  },
  responseText: {
    fontSize: 12,
    color: '#ffffff',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

export default OBDScannerScreen;
