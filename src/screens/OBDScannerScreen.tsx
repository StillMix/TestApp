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
  Linking,
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
  const [status, setStatus] = useState<string>('Готов к инициализации');
  const [command, setCommand] = useState<string>('');
  const [responses, setResponses] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanAnimation] = useState(new Animated.Value(0));
  const [pulseAnimation] = useState(new Animated.Value(1));

  // Возможные UUID для ELM327 устройств
  const POSSIBLE_SERVICE_UUIDS = [
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
    'fff0', // Общий сервис
    '00001101-0000-1000-8000-00805f9b34fb', // SPP
  ];

  const POSSIBLE_WRITE_CHARACTERISTICS = [
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART TX
    'fff1',
    'fff2',
    'fff3',
  ];

  const POSSIBLE_NOTIFY_CHARACTERISTICS = [
    '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART RX
    'fff4',
    'fff1',
    'fff2',
  ];

  // Анимации
  const startScanAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnimation, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
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
  }, [pulseAnimation]);

  const stopPulseAnimation = useCallback(() => {
    pulseAnimation.stopAnimation();
    pulseAnimation.setValue(1);
  }, [pulseAnimation]);

  // Запрос разрешений для Android
  const requestAndroidPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') return true;

    try {
      console.log('Запрос разрешений Android...');
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      console.log('Результат разрешений Android:', granted);

      const allGranted = Object.values(granted).every(
        permission => permission === PermissionsAndroid.RESULTS.GRANTED,
      );

      if (!allGranted) {
        Alert.alert(
          'Разрешения не получены',
          'Для работы с Bluetooth необходимы все разрешения',
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Ошибка запроса разрешений Android:', error);
      return false;
    }
  }, []);

  // Инициализация BLE
  const initializeBLE = useCallback(async () => {
    try {
      console.log('=== ИНИЦИАЛИЗАЦИЯ BLE ===');
      setStatus('Инициализация BLE...');

      // Для Android - запрашиваем разрешения
      if (Platform.OS === 'android') {
        const hasPermissions = await requestAndroidPermissions();
        if (!hasPermissions) {
          setStatus('Нет разрешений Android');
          return;
        }
      }

      console.log('Запуск BLE Manager...');
      await BleManager.start({ showAlert: false });
      console.log('BLE Manager запущен');

      // Задержка для полной инициализации
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Проверяем состояние Bluetooth
      const state = await BleManager.checkState();
      console.log('Состояние BLE:', state);

      if (state === 'on') {
        setStatus('BLE готов к сканированию');
        console.log('✅ BLE успешно инициализирован');

        if (Platform.OS === 'ios') {
          setStatus('BLE готов. При сканировании iOS запросит разрешения');
        }
      } else {
        setStatus(`Bluetooth выключен: ${state}`);
        Alert.alert(
          'Bluetooth выключен',
          'Включите Bluetooth в настройках устройства',
          [
            { text: 'OK' },
            { text: 'Настройки', onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch (error) {
      console.error('Ошибка инициализации BLE:', error);
      setStatus(`Ошибка BLE: ${error.message}`);

      if (Platform.OS === 'ios' && error.message?.includes('unauthorized')) {
        Alert.alert(
          'Нужны разрешения',
          'При первом сканировании iOS попросит разрешения на Bluetooth и местоположение. Обязательно разрешите их.',
          [{ text: 'Понятно' }],
        );
      }
    }
  }, [requestAndroidPermissions]);

  // Проверка, является ли устройство потенциально ELM327
  const isPotentialELM327 = useCallback((peripheral: any): boolean => {
    const name = (peripheral.name || '').toLowerCase();
    const localName = (peripheral.advertising?.localName || '').toLowerCase();

    const elm327Keywords = [
      'elm327',
      'elm',
      'obd',
      'obdii',
      'obd2',
      'v-link',
      'vlink',
      'vlinker',
      'vgate',
      'scan',
      'scanner',
      'auto',
      'car',
      'vehicle',
      'diag',
      'diagnostic',
      'ecu',
      'can',
      'canbus',
      'bluetooth',
      'ble',
      'torque',
      'forscan',
      'konnwei',
      'autel',
      'launch',
      'nexas',
      'innova',
      'ancel',
      'foxwell',
      'thinkcar',
      'veepeak',
      'panlong',
      'bafx',
      'lemur',
    ];

    const fullText = `${name} ${localName}`.toLowerCase();

    return elm327Keywords.some(keyword => fullText.includes(keyword));
  }, []);

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

  // Начало сканирования
  const startScan = useCallback(async () => {
    if (isScanning) {
      await stopScan();
      return;
    }

    try {
      console.log('=== НАЧАЛО СКАНИРОВАНИЯ ===');

      // Проверяем состояние BLE
      const state = await BleManager.checkState();
      console.log('Состояние BLE:', state);

      if (state !== 'on') {
        setStatus('Bluetooth выключен');
        Alert.alert(
          'Bluetooth выключен',
          'Включите Bluetooth и попробуйте снова',
        );
        return;
      }

      setDevices([]);
      setIsScanning(true);
      setStatus('Сканирование устройств...');
      startScanAnimation();

      // Получаем сопряженные устройства (для iOS важно!)
      console.log('Поиск сопряженных устройств...');
      try {
        const bondedDevices = await BleManager.getBondedPeripherals();
        console.log('Сопряженные устройства:', bondedDevices);

        bondedDevices.forEach(device => {
          console.log(`Сопряженное: ${device.name} (${device.id})`);
          setDevices(current => {
            const exists = current.find(d => d.id === device.id);
            if (!exists) {
              return [
                ...current,
                {
                  id: device.id,
                  name: `🔗 ${device.name || 'Неизвестное'} (сопряжен)`,
                  rssi: -50,
                  rawData: device,
                },
              ];
            }
            return current;
          });
        });
      } catch (error) {
        console.log(
          'Не удалось получить сопряженные устройства:',
          error.message,
        );
      }

      // Обработчик обнаружения устройств
      const handleDiscoverPeripheral = (peripheral: any) => {
        console.log('=== ОБНАРУЖЕНО УСТРОЙСТВО ===');
        console.log('ID:', peripheral.id);
        console.log('Name:', peripheral.name);
        console.log('LocalName:', peripheral.advertising?.localName);
        console.log('RSSI:', peripheral.rssi);
        console.log('Connectable:', peripheral.advertising?.isConnectable);
        console.log('ServiceUUIDs:', peripheral.advertising?.serviceUUIDs);
        console.log(
          'ManufacturerData:',
          peripheral.advertising?.manufacturerData,
        );

        const deviceName =
          peripheral.name ||
          peripheral.advertising?.localName ||
          `Устройство ${peripheral.id.slice(-4)}`;

        const isELM327Candidate = isPotentialELM327(peripheral);
        console.log('Потенциальный ELM327:', isELM327Candidate);

        setDevices(current => {
          const exists = current.find(device => device.id === peripheral.id);
          if (!exists) {
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

      // Запуск сканирования
      console.log('Запуск BLE сканирования...');
      await BleManager.scan([], 20, true); // 20 секунд, разрешить дубликаты
      console.log('Сканирование запущено');

      // Автоматическая остановка через 20 секунд
      setTimeout(async () => {
        console.log('Автоматическая остановка сканирования');
        await stopScan();
        subscription.remove();
      }, 20000);
    } catch (error) {
      console.error('Ошибка при запуске сканирования:', error);
      setStatus(`Ошибка сканирования: ${error.message}`);
      setIsScanning(false);
      stopScanAnimation();

      // Специальная обработка для iOS
      if (Platform.OS === 'ios') {
        if (
          error.message?.includes('unauthorized') ||
          error.message?.includes('permission')
        ) {
          Alert.alert(
            'Нужны разрешения',
            'Разрешите доступ к Bluetooth и местоположению в настройках iPhone:\n\n' +
              'Настройки → Конфиденциальность → Bluetooth → TestApp\n' +
              'Настройки → Конфиденциальность → Службы геолокации → TestApp',
            [
              { text: 'OK' },
              {
                text: 'Открыть настройки',
                onPress: () => Linking.openSettings(),
              },
            ],
          );
        }
      }
    }
  }, [
    isScanning,
    stopScan,
    startScanAnimation,
    stopScanAnimation,
    isPotentialELM327,
  ]);

  // Подключение к устройству
  const connectToDevice = useCallback(
    async (deviceId: string) => {
      try {
        console.log(`=== ПОДКЛЮЧЕНИЕ К ${deviceId} ===`);
        setStatus(`Подключение к ${deviceId.slice(-4)}...`);

        await BleManager.connect(deviceId);
        console.log('Подключено к устройству');

        setConnectedDevice(deviceId);
        setIsConnected(true);
        setStatus(`Подключено к ${deviceId.slice(-4)}`);
        startPulseAnimation();

        // Получаем сервисы
        console.log('Получение сервисов...');
        const services = await BleManager.retrieveServices(deviceId);
        console.log('Сервисы устройства:', JSON.stringify(services, null, 2));

        setResponses(current => [
          ...current,
          `✅ Подключено к ${deviceId.slice(-4)}`,
          `📋 Найдено сервисов: ${services.services?.length || 0}`,
        ]);

        // Автоматическая инициализация ELM327
        setTimeout(() => {
          initializeELM327();
        }, 2000);
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
    if (!connectedDevice) return;

    try {
      console.log(`=== ОТКЛЮЧЕНИЕ ОТ ${connectedDevice} ===`);
      await BleManager.disconnect(connectedDevice);

      setConnectedDevice(null);
      setIsConnected(false);
      setStatus('Отключено');
      stopPulseAnimation();

      setResponses(current => [
        ...current,
        `❌ Отключено от ${connectedDevice.slice(-4)}`,
      ]);

      console.log('Отключено от устройства');
    } catch (error) {
      console.error('Ошибка отключения:', error);
      setResponses(current => [
        ...current,
        `❌ Ошибка отключения: ${error.message}`,
      ]);
    }
  }, [connectedDevice, stopPulseAnimation]);

  // Отправка команды напрямую
  const sendCommandDirect = useCallback(
    async (cmd: string) => {
      if (!connectedDevice) {
        throw new Error('Нет подключения к устройству');
      }

      try {
        console.log(`Отправка команды: ${cmd}`);

        // Пробуем найти подходящие характеристики для записи
        for (const serviceUUID of POSSIBLE_SERVICE_UUIDS) {
          for (const charUUID of POSSIBLE_WRITE_CHARACTERISTICS) {
            try {
              const command = cmd + '\r';
              const data = Array.from(command).map(char => char.charCodeAt(0));

              await BleManager.write(
                connectedDevice,
                serviceUUID,
                charUUID,
                data,
              );
              console.log(
                `✅ Команда отправлена через ${serviceUUID}/${charUUID}`,
              );
              return;
            } catch (writeError) {
              console.log(
                `Не удалось отправить через ${serviceUUID}/${charUUID}:`,
                writeError.message,
              );
            }
          }
        }

        throw new Error('Не найдена подходящая характеристика для записи');
      } catch (error) {
        console.error('Ошибка отправки команды:', error);
        throw error;
      }
    },
    [connectedDevice],
  );

  // Инициализация ELM327
  const initializeELM327 = useCallback(async () => {
    if (!connectedDevice) {
      Alert.alert('Ошибка', 'Нет подключения к устройству');
      return;
    }

    try {
      console.log('=== ИНИЦИАЛИЗАЦИЯ ELM327 ===');
      setResponses(current => [...current, '🔧 Инициализация ELM327...']);

      // Базовые команды инициализации ELM327
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
        setResponses(current => [...current, `> ${cmd}`]);
      }

      setResponses(current => [...current, '✅ ELM327 инициализирован']);
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
      // Автоматически отправляем команду
      setTimeout(() => {
        sendCommand();
      }, 100);
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
      style={[
        styles.deviceItem,
        connectedDevice === item.id && styles.connectedDevice,
      ]}
      onPress={() => connectToDevice(item.id)}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.name}</Text>
        <Text style={styles.deviceId}>ID: {item.id}</Text>
        {item.rssi && (
          <Text style={styles.deviceRssi}>Сигнал: {item.rssi} dBm</Text>
        )}
      </View>
      <Text style={styles.deviceIcon}>
        {connectedDevice === item.id ? '🔗' : '📱'}
      </Text>
    </TouchableOpacity>
  );

  // Рендер элемента ответа
  const renderResponse = ({ item }: { item: string }) => (
    <Text style={styles.responseText}>{item}</Text>
  );

  // Рендер быстрой команды
  const renderQuickCommand = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.quickCommand}
      onPress={() => sendQuickCommand(item.cmd)}
      disabled={!isConnected}
    >
      <Text style={styles.quickCommandIcon}>{item.icon}</Text>
      <Text style={styles.quickCommandTitle}>{item.title}</Text>
      <Text style={styles.quickCommandCmd}>{item.cmd}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView style={styles.scrollView}>
        {/* Статус */}
        <View style={styles.statusContainer}>
          <Animated.View
            style={[
              styles.statusIndicator,
              {
                backgroundColor: isConnected
                  ? '#4CAF50'
                  : isScanning
                  ? '#FF9800'
                  : '#757575',
                transform: [{ scale: isConnected ? pulseAnimation : 1 }],
              },
            ]}
          />
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {/* Управление */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Управление</Text>

          <ActionButton
            title="Инициализировать BLE"
            icon="🔄"
            onPress={initializeBLE}
            variant="secondary"
          />

          <ActionButton
            title={
              isScanning ? 'Остановить сканирование' : 'Начать сканирование'
            }
            icon={isScanning ? '⏹️' : '🔍'}
            onPress={startScan}
            variant="primary"
          />

          {connectedDevice && (
            <ActionButton
              title="Отключиться"
              icon="❌"
              onPress={disconnectDevice}
              variant="danger"
            />
          )}
        </View>

        {/* Устройства */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Найденные устройства ({devices.length})
          </Text>
          {devices.length > 0 ? (
            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={item => item.id}
              style={styles.devicesList}
              scrollEnabled={false}
            />
          ) : (
            <Text style={styles.emptyText}>
              {isScanning
                ? 'Поиск устройств...'
                : 'Нажмите "Начать сканирование"'}
            </Text>
          )}
        </View>

        {/* Быстрые команды */}
        {isConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Быстрые команды</Text>
            <FlatList
              data={quickCommands}
              renderItem={renderQuickCommand}
              keyExtractor={item => item.cmd}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.quickCommandsList}
            />
          </View>
        )}

        {/* Ввод команды */}
        {isConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Отправка команды</Text>
            <View style={styles.commandInputContainer}>
              <TextInput
                style={styles.commandInput}
                value={command}
                onChangeText={setCommand}
                placeholder="Введите OBD команду (например: 01 00)"
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={styles.sendButton}
                onPress={sendCommand}
                disabled={!command.trim()}
              >
                <Text style={styles.sendButtonText}>📤</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Ответы */}
        {responses.length > 0 && (
          <View style={styles.section}>
            <View style={styles.responsesHeader}>
              <Text style={styles.sectionTitle}>Логи ({responses.length})</Text>
              <TouchableOpacity onPress={clearResponses}>
                <Text style={styles.clearButton}>🗑️ Очистить</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.responsesContainer}>
              <FlatList
                data={responses}
                renderItem={renderResponse}
                keyExtractor={(item, index) => index.toString()}
                style={styles.responsesList}
                scrollEnabled={false}
              />
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
    padding: 16,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
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
