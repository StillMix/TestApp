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
  rawData?: any;
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

  // Возможные UUID для ELM327 устройств
  const POSSIBLE_SERVICE_UUIDS = [
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
    'fff0', // Некоторые ELM327
    '0000fff0-0000-1000-8000-00805f9b34fb', // ELM327 BLE
    '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile
  ];

  const POSSIBLE_RX_UUIDS = [
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART RX
    'fff1', // ELM327 RX
    '0000fff1-0000-1000-8000-00805f9b34fb',
  ];

  const POSSIBLE_TX_UUIDS = [
    '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART TX
    'fff2', // ELM327 TX
    '0000fff2-0000-1000-8000-00805f9b34fb',
  ];

  // Текущие рабочие UUID (будут определены при подключении)
  const [currentServiceUUID, setCurrentServiceUUID] = useState<string>('');
  const [currentRxUUID, setCurrentRxUUID] = useState<string>('');
  const [currentTxUUID, setCurrentTxUUID] = useState<string>('');

  // Анимации
  const startScanAnimation = useCallback(() => {
    Animated.loop(
      Animated.timing(scanAnimation, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
    ).start();
  }, [scanAnimation]);

  const stopScanAnimation = useCallback(() => {
    scanAnimation.stopAnimation();
    scanAnimation.setValue(0);
  }, [scanAnimation]);

  const startPulseAnimation = useCallback(() => {
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
  }, [pulseAnimation]);

  // Запрос разрешений для Android
  const requestPermissions = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED,
        );

        if (!allGranted) {
          Alert.alert(
            'Разрешения',
            'Для работы с Bluetooth необходимы все разрешения',
          );
          return false;
        }
        return true;
      } catch (error) {
        console.error('Ошибка запроса разрешений:', error);
        return false;
      }
    }
    return true;
  }, []);

  // Инициализация BLE
  const initializeBLE = useCallback(async () => {
    try {
      console.log('=== ИНИЦИАЛИЗАЦИЯ BLE ===');

      // Запрос разрешений
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        setStatus('Нет разрешений');
        return;
      }

      setStatus('Инициализация BLE...');
      await BleManager.start({ showAlert: false });

      // Проверяем состояние Bluetooth
      const state = await BleManager.checkState();
      console.log('BLE состояние:', state);

      if (state !== 'on') {
        Alert.alert('Ошибка', 'Включите Bluetooth в настройках');
        setStatus('Bluetooth выключен');
        return;
      }

      console.log('BLE инициализирован успешно');
      setStatus('BLE готов к сканированию');
    } catch (error) {
      console.error('Ошибка инициализации BLE:', error);
      setStatus(`Ошибка BLE: ${error.message}`);
      Alert.alert(
        'Ошибка',
        `Не удалось инициализировать BLE: ${error.message}`,
      );
    }
  }, [requestPermissions]);

  // Остановка сканирования
  const stopScan = useCallback(async () => {
    try {
      await BleManager.stopScan();
      setIsScanning(false);
      stopScanAnimation();
      setStatus(`Найдено устройств: ${devices.length}`);
      console.log('Сканирование остановлено');
    } catch (error) {
      console.error('Ошибка остановки сканирования:', error);
    }
  }, [devices.length, stopScanAnimation]);

  // Проверка, является ли устройство потенциально ELM327
  const isPotentialELM327 = (peripheral: any): boolean => {
    const name = (peripheral.name || '').toLowerCase();
    const localName = (peripheral.advertising?.localName || '').toLowerCase();

    const elm327Keywords = [
      'elm',
      'obd',
      'obdii',
      'v-link',
      'vlink',
      'vgate',
      'scan',
      'auto',
      'car',
      'diag',
      'ecu',
      'can',
      'bluetooth',
    ];

    return elm327Keywords.some(
      keyword => name.includes(keyword) || localName.includes(keyword),
    );
  };

  // Начало сканирования
  const startScan = useCallback(async () => {
    if (isScanning) {
      await stopScan();
      return;
    }

    try {
      console.log('=== НАЧАЛО СКАНИРОВАНИЯ ===');

      setDevices([]);
      setIsScanning(true);
      setStatus('Сканирование устройств...');
      startScanAnimation();

      // Проверка состояния Bluetooth
      const state = await BleManager.checkState();
      console.log('Bluetooth состояние перед сканированием:', state);

      if (state !== 'on') {
        throw new Error('Bluetooth выключен');
      }

      // Обработчик обнаружения устройств
      const handleDiscoverPeripheral = (peripheral: any) => {
        console.log('=== ОБНАРУЖЕНО УСТРОЙСТВО ===');
        console.log('ID:', peripheral.id);
        console.log('Name:', peripheral.name);
        console.log('LocalName:', peripheral.advertising?.localName);
        console.log('RSSI:', peripheral.rssi);
        console.log('IsConnectable:', peripheral.advertising?.isConnectable);
        console.log('ServiceUUIDs:', peripheral.advertising?.serviceUUIDs);
        console.log(
          'ManufacturerData:',
          peripheral.advertising?.manufacturerData,
        );
        console.log('Raw данные:', JSON.stringify(peripheral, null, 2));

        const isELM327Candidate = isPotentialELM327(peripheral);
        console.log('Потенциальный ELM327:', isELM327Candidate);

        // Добавляем ВСЕ устройства для отладки, но помечаем ELM327 кандидатов
        setDevices(current => {
          const exists = current.find(device => device.id === peripheral.id);
          if (!exists) {
            const deviceName =
              peripheral.name ||
              peripheral.advertising?.localName ||
              `Устройство ${peripheral.id.slice(-4)}`;

            return [
              ...current,
              {
                id: peripheral.id,
                name: isELM327Candidate ? `🚗 ${deviceName}` : deviceName,
                rssi: peripheral.rssi,
                rawData: peripheral,
              },
            ];
          }
          return current;
        });
      };

      // Подписка на события обнаружения
      const subscription: EmitterSubscription = DeviceEventEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        handleDiscoverPeripheral,
      );

      // Запуск сканирования (60 секунд, разрешить дубликаты)
      console.log('Запуск BLE сканирования...');
      await BleManager.scan([], 60, true);
      console.log('Сканирование запущено');

      // Автоматическая остановка через 60 секунд
      setTimeout(async () => {
        console.log('Автоматическая остановка сканирования');
        await stopScan();
        subscription.remove();
      }, 60000);
    } catch (error) {
      console.error('Ошибка при запуске сканирования:', error);
      setStatus(`Ошибка сканирования: ${error.message}`);
      setIsScanning(false);
      stopScanAnimation();
      Alert.alert(
        'Ошибка',
        `Не удалось запустить сканирование: ${error.message}`,
      );
    }
  }, [isScanning, startScanAnimation, stopScan, isPotentialELM327]);

  // Поиск подходящих UUID сервисов
  const findWorkingUUIDs = async (
    deviceId: string,
  ): Promise<{ service: string; rx: string; tx: string } | null> => {
    try {
      console.log('Получение сервисов устройства...');
      const peripheralInfo = await BleManager.retrieveServices(deviceId);
      console.log(
        'Информация об устройстве:',
        JSON.stringify(peripheralInfo, null, 2),
      );

      // Проверяем каждый возможный сервис
      for (const serviceUUID of POSSIBLE_SERVICE_UUIDS) {
        const service = peripheralInfo.services?.find(
          s => s.uuid.toLowerCase() === serviceUUID.toLowerCase(),
        );

        if (service) {
          console.log(`Найден сервис: ${serviceUUID}`);

          // Ищем RX и TX характеристики
          for (const rxUUID of POSSIBLE_RX_UUIDS) {
            for (const txUUID of POSSIBLE_TX_UUIDS) {
              const rxChar = service.characteristics?.find(
                c => c.characteristic.toLowerCase() === rxUUID.toLowerCase(),
              );
              const txChar = service.characteristics?.find(
                c => c.characteristic.toLowerCase() === txUUID.toLowerCase(),
              );

              if (rxChar && txChar) {
                console.log(
                  `Найдены рабочие UUID: service=${serviceUUID}, rx=${rxUUID}, tx=${txUUID}`,
                );
                return { service: serviceUUID, rx: rxUUID, tx: txUUID };
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Ошибка поиска UUID:', error);
      return null;
    }
  };

  // Подключение к устройству
  const connectToDevice = useCallback(
    async (deviceId: string, deviceName?: string) => {
      try {
        console.log(`=== ПОДКЛЮЧЕНИЕ К УСТРОЙСТВУ ${deviceId} ===`);
        setStatus(`Подключение к ${deviceName || deviceId}...`);

        // Подключение к устройству
        console.log('1. Подключение...');
        await BleManager.connect(deviceId);
        console.log('Подключено к устройству');

        // Поиск рабочих UUID
        console.log('2. Поиск сервисов...');
        const workingUUIDs = await findWorkingUUIDs(deviceId);

        if (!workingUUIDs) {
          throw new Error('Не удалось найти совместимые сервисы UART');
        }

        // Сохраняем рабочие UUID
        setCurrentServiceUUID(workingUUIDs.service);
        setCurrentRxUUID(workingUUIDs.rx);
        setCurrentTxUUID(workingUUIDs.tx);

        console.log('3. Включение уведомлений...');
        // Включаем уведомления для TX характеристики (получение данных)
        await BleManager.startNotification(
          deviceId,
          workingUUIDs.service,
          workingUUIDs.tx,
        );
        console.log('Уведомления включены');

        setConnectedDevice(deviceId);
        setIsConnected(true);
        setStatus(`Подключено к ${deviceName || deviceId}`);
        startPulseAnimation();

        // Инициализация ELM327 через небольшую задержку
        setTimeout(() => {
          initializeELM327();
        }, 2000);

        Alert.alert('Успех!', `Подключено к ${deviceName || deviceId}`);
      } catch (error) {
        console.error('Ошибка подключения:', error);
        setStatus(`Ошибка подключения: ${error.message}`);
        Alert.alert('Ошибка подключения', error.message);
      }
    },
    [startPulseAnimation],
  );

  // Отключение от устройства
  const disconnectDevice = useCallback(async () => {
    if (connectedDevice) {
      try {
        console.log('=== ОТКЛЮЧЕНИЕ ===');

        // Остановка уведомлений
        if (currentServiceUUID && currentTxUUID) {
          await BleManager.stopNotification(
            connectedDevice,
            currentServiceUUID,
            currentTxUUID,
          );
        }

        // Отключение
        await BleManager.disconnect(connectedDevice);

        setConnectedDevice(null);
        setIsConnected(false);
        setStatus('Отключено');
        setResponses([]);
        setCurrentServiceUUID('');
        setCurrentRxUUID('');
        setCurrentTxUUID('');

        pulseAnimation.stopAnimation();
        pulseAnimation.setValue(1);

        Alert.alert('Успех', 'Устройство отключено');
      } catch (error) {
        console.error('Ошибка отключения:', error);
        Alert.alert('Ошибка', 'Не удалось отключиться');
      }
    }
  }, [connectedDevice, currentServiceUUID, currentTxUUID, pulseAnimation]);

  // Отправка команды напрямую
  const sendCommandDirect = useCallback(
    async (cmd: string): Promise<void> => {
      if (!connectedDevice || !currentServiceUUID || !currentRxUUID) {
        throw new Error('Устройство не подключено или UUID не определены');
      }

      try {
        const commandWithCR = cmd.trim() + '\r';
        const data = Array.from(commandWithCR, char => char.charCodeAt(0));

        console.log(`Отправка команды: ${cmd}`);
        await BleManager.write(
          connectedDevice,
          currentServiceUUID,
          currentRxUUID,
          data,
        );
        console.log(`Команда отправлена: ${cmd}`);
      } catch (error) {
        console.error('Ошибка отправки команды:', error);
        throw error;
      }
    },
    [connectedDevice, currentServiceUUID, currentRxUUID],
  );

  // Инициализация ELM327
  const initializeELM327 = useCallback(async () => {
    if (!connectedDevice) return;

    try {
      console.log('=== ИНИЦИАЛИЗАЦИЯ ELM327 ===');
      setResponses(current => [...current, '🔧 Инициализация ELM327...']);

      // Последовательность команд инициализации
      const initCommands = [
        'ATZ', // Сброс
        'ATE0', // Отключить эхо
        'ATL0', // Отключить переводы строк
        'ATS0', // Отключить пробелы
        'ATH1', // Включить заголовки
        'ATSP0', // Автоматический протокол
        'ATRV', // Проверить напряжение
      ];

      for (let i = 0; i < initCommands.length; i++) {
        const cmd = initCommands[i];
        setResponses(current => [...current, `> ${cmd}`]);

        try {
          await sendCommandDirect(cmd);
          await new Promise(resolve => setTimeout(resolve, 1000));
          setResponses(current => [...current, `✅ ${cmd} - OK`]);
        } catch (error) {
          setResponses(current => [
            ...current,
            `❌ ${cmd} - ERROR: ${error.message}`,
          ]);
        }
      }

      setResponses(current => [...current, '🎉 ELM327 инициализирован!']);
      setStatus('ELM327 готов к работе');
    } catch (error) {
      console.error('Ошибка инициализации ELM327:', error);
      setResponses(current => [
        ...current,
        `❌ Ошибка инициализации: ${error.message}`,
      ]);
      setStatus('Ошибка инициализации ELM327');
    }
  }, [connectedDevice, sendCommandDirect]);

  // Отправка команды через UI
  const sendCommand = useCallback(async () => {
    if (!connectedDevice || !command.trim()) {
      Alert.alert('Ошибка', 'Введите команду для отправки');
      return;
    }

    try {
      setResponses(current => [...current, `> ${command}`]);
      await sendCommandDirect(command);
      setCommand('');

      // Добавляем заглушку ответа (в реальности нужно читать через уведомления)
      setTimeout(() => {
        setResponses(current => [
          ...current,
          '📡 Команда отправлена (ответ в разработке)',
        ]);
      }, 500);
    } catch (error) {
      console.error('Ошибка отправки команды:', error);
      setResponses(current => [...current, `❌ Ошибка: ${error.message}`]);
    }
  }, [connectedDevice, command, sendCommandDirect]);

  // Быстрые команды
  const quickCommands = [
    { title: 'Проверка связи', cmd: '01 00', icon: '🔗' },
    { title: 'VIN номер', cmd: '09 02', icon: '🆔' },
    { title: 'Обороты двигателя', cmd: '01 0C', icon: '⚡' },
    { title: 'Скорость', cmd: '01 0D', icon: '🏃' },
    { title: 'Температура ОЖ', cmd: '01 05', icon: '🌡️' },
  ];

  const sendQuickCommand = useCallback(
    (cmd: string) => {
      setCommand(cmd);
      sendCommand();
    },
    [sendCommand],
  );

  // Очистка логов
  const clearResponses = useCallback(() => {
    setResponses([]);
  }, []);

  // Инициализация при загрузке
  useEffect(() => {
    initializeBLE();

    return () => {
      if (isScanning) {
        BleManager.stopScan();
      }
      DeviceEventEmitter.removeAllListeners('BleManagerDiscoverPeripheral');
      DeviceEventEmitter.removeAllListeners(
        'BleManagerDidUpdateValueForCharacteristic',
      );
    };
  }, [initializeBLE, isScanning]);

  // Рендер элемента устройства
  const renderDevice = ({ item }: { item: BluetoothDevice }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => connectToDevice(item.id, item.name)}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>
          {item.name || 'Неизвестное устройство'}
        </Text>
        <Text style={styles.deviceId}>ID: {item.id}</Text>
        {item.rssi && (
          <Text style={styles.deviceRssi}>RSSI: {item.rssi} dBm</Text>
        )}
      </View>
      <Text style={styles.connectIcon}>📱</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView style={styles.scrollView}>
        {/* Заголовок и статус */}
        <View style={styles.header}>
          <Text style={styles.title}>🚗 OBD2 ELM327 Scanner</Text>
          <Animated.View
            style={[
              styles.statusContainer,
              isConnected && { transform: [{ scale: pulseAnimation }] },
            ]}
          >
            <Text
              style={[styles.status, isConnected && styles.connectedStatus]}
            >
              {isConnected ? '🟢' : '🔴'} {status}
            </Text>
          </Animated.View>
        </View>

        {/* Кнопки управления */}
        <View style={styles.controlsContainer}>
          <ActionButton
            title={isScanning ? 'Остановить' : 'Сканировать'}
            icon={isScanning ? '⏹️' : '🔍'}
            onPress={startScan}
            variant="primary"
          />

          {isConnected && (
            <ActionButton
              title="Отключить"
              icon="🔌"
              onPress={disconnectDevice}
              variant="danger"
            />
          )}
        </View>

        {/* Список устройств */}
        {devices.length > 0 && (
          <View style={styles.devicesContainer}>
            <Text style={styles.sectionTitle}>
              📱 Найденные устройства ({devices.length})
            </Text>
            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={item => item.id}
              style={styles.devicesList}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* Быстрые команды */}
        {isConnected && (
          <View style={styles.quickCommandsContainer}>
            <Text style={styles.sectionTitle}>⚡ Быстрые команды</Text>
            <View style={styles.quickCommandsGrid}>
              {quickCommands.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickCommandButton}
                  onPress={() => sendQuickCommand(item.cmd)}
                >
                  <Text style={styles.quickCommandIcon}>{item.icon}</Text>
                  <Text style={styles.quickCommandText}>{item.title}</Text>
                  <Text style={styles.quickCommandCode}>{item.cmd}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Ввод команды */}
        {isConnected && (
          <View style={styles.commandContainer}>
            <Text style={styles.sectionTitle}>💻 Отправка команд</Text>
            <View style={styles.commandInputContainer}>
              <TextInput
                style={styles.commandInput}
                value={command}
                onChangeText={setCommand}
                placeholder="Введите OBD команду (например: 01 00)"
                placeholderTextColor="#999"
                autoCapitalize="characters"
              />
              <TouchableOpacity style={styles.sendButton} onPress={sendCommand}>
                <Text style={styles.sendButtonText}>📤</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Лог ответов */}
        {responses.length > 0 && (
          <View style={styles.responsesContainer}>
            <View style={styles.responsesHeader}>
              <Text style={styles.sectionTitle}>📋 Лог команд</Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearResponses}
              >
                <Text style={styles.clearButtonText}>🗑️ Очистить</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.responsesContent}>
              {responses.map((response, index) => (
                <Text key={index} style={styles.response}>
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
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    marginBottom: 10,
  },
  statusContainer: {
    alignItems: 'center',
  },
  status: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  connectedStatus: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  controlsContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    gap: 8,
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
    fontSize: 18,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#fff',
  },
  secondaryButtonText: {
    color: '#fff',
  },
  dangerButtonText: {
    color: '#fff',
  },
  devicesContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  devicesList: {
    maxHeight: 300,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
  },
  deviceRssi: {
    fontSize: 12,
    color: '#999',
  },
  connectIcon: {
    fontSize: 24,
  },
  quickCommandsContainer: {
    padding: 20,
  },
  quickCommandsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickCommandButton: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickCommandIcon: {
    fontSize: 24,
    marginBottom: 5,
  },
  quickCommandText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 3,
  },
  quickCommandCode: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'Courier',
  },
  commandContainer: {
    padding: 20,
  },
  commandInputContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  commandInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Courier',
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    fontSize: 18,
  },
  responsesContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  responsesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  clearButton: {
    backgroundColor: '#FF5722',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  responsesContent: {
    backgroundColor: '#000',
    borderRadius: 10,
    padding: 15,
    maxHeight: 300,
  },
  response: {
    color: '#00FF00',
    fontSize: 12,
    fontFamily: 'Courier',
    marginBottom: 3,
  },
});

export default OBDScannerScreen;
