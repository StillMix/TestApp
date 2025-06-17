import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  Text,
  Button,
  FlatList,
  StyleSheet,
  View,
  Alert,
  TextInput,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import BleManager, { Peripheral } from 'react-native-ble-manager';

// Импортируем наши реальные команды
const REAL_TEST_COMMANDS = {
  quickTest: ['ATZ', 'ATE0', 'ATSP0', '0100', '010C', '010D'],
  initialization: ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATSP0'],
  basicData: ['010C', '010D', '0105', '010F', '0111'],
  info: ['ATI', 'ATRV', 'ATDP', '0902'],
};

const RealCarTestApp: React.FC = () => {
  const [devices, setDevices] = useState<Peripheral[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [status, setStatus] = useState('Поиск ELM327 адаптеров...');
  const [command, setCommand] = useState('ATZ');
  const [responses, setResponses] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [_testResults, _setTestResults] = useState<any>({});

  const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // iOS → ELM327
  const TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // ELM327 → iOS

  const addResponse = useCallback((response: string) => {
    setResponses(prev => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${response}`,
    ]);
  }, []);

  const scanForELM327 = useCallback(async () => {
    try {
      await BleManager.scan([], 15, true);

      setTimeout(async () => {
        const foundDevices = await BleManager.getDiscoveredPeripherals();

        // Ищем устройства которые могут быть ELM327
        const elm327Devices = foundDevices.filter(
          device =>
            device.name &&
            (device.name.toLowerCase().includes('elm327') ||
              device.name.toLowerCase().includes('obd') ||
              device.name.toLowerCase().includes('can') ||
              device.name.toLowerCase().includes('car') ||
              device.name.toLowerCase().includes('auto') ||
              device.name.toLowerCase().includes('obdii') ||
              device.name.toLowerCase().includes('elm') ||
              // Популярные китайские адаптеры:
              device.name.toLowerCase().includes('vgate') ||
              device.name.toLowerCase().includes('veepeak') ||
              device.name.toLowerCase().includes('obdlink')),
        );

        setDevices(elm327Devices);
        setStatus(`Найдено потенциальных ELM327: ${elm327Devices.length}`);

        if (elm327Devices.length === 0) {
          setStatus(
            '❌ ELM327 адаптеры не найдены. Убедитесь что адаптер включен и в режиме сопряжения.',
          );
        }
      }, 15000);
    } catch (error: any) {
      setStatus('Ошибка сканирования: ' + error.message);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        await BleManager.start({ showAlert: false });
        setStatus('🔍 Сканирование ELM327 адаптеров...');
        scanForELM327();
      } catch (error: any) {
        setStatus('❌ Ошибка BLE: ' + error.message);
      }
    };

    // Добавляем listener для ответов от ELM327
    const listener = DeviceEventEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      ({
        characteristic,
        value,
      }: {
        characteristic: string;
        value: number[];
      }) => {
        if (characteristic === TX_UUID) {
          const response = String.fromCharCode(...value);
          addResponse(`ELM327: ${response.trim()}`);
        }
      },
    );

    initialize();

    // Очистка при размонтировании компонента
    return () => listener.remove();
  }, [addResponse, scanForELM327]);

  const connectToELM327 = async (deviceId: string) => {
    try {
      setStatus('🔌 Подключение к ELM327...');
      addResponse(`Подключение к устройству: ${deviceId}`);

      await BleManager.connect(deviceId);
      await BleManager.retrieveServices(deviceId);

      // Подписываемся на уведомления от ELM327
      await BleManager.startNotification(deviceId, SERVICE_UUID, TX_UUID);

      setConnectedDevice(deviceId);
      setIsConnected(true);
      setStatus('✅ Подключено к ELM327! Готов к тестированию.');

      addResponse('=== ПОДКЛЮЧЕНИЕ УСТАНОВЛЕНО ===');
      addResponse('⚠️  УБЕДИТЕСЬ ЧТО МАШИНА ЗАВЕДЕНА!');
      addResponse('⚠️  ELM327 ПОДКЛЮЧЕН К OBD ПОРТУ!');
    } catch (error: any) {
      setStatus('❌ Ошибка подключения: ' + error.message);
      Alert.alert(
        'Ошибка подключения',
        'Не удалось подключиться к ELM327. Проверьте что устройство поддерживает BLE и находится в режиме сопряжения.',
      );
    }
  };

  const sendRealCommand = async (cmd: string) => {
    if (!connectedDevice || !isConnected) {
      Alert.alert('Ошибка', 'Сначала подключитесь к ELM327');
      return;
    }

    try {
      const commandWithCR = cmd.trim() + '\r';
      const data = Array.from(commandWithCR).map(char => char.charCodeAt(0));

      await BleManager.write(
        connectedDevice,
        SERVICE_UUID,
        RX_UUID,
        data,
        data.length,
      );

      addResponse(`ОТПРАВЛЕНО: ${cmd}`);
      setCommand('');
    } catch (error: any) {
      Alert.alert('Ошибка отправки', error.message);
      addResponse(`ОШИБКА: ${error.message}`);
    }
  };

  const runQuickTest = async () => {
    addResponse('\n🚗 === БЫСТРЫЙ ТЕСТ ELM327 В МАШИНЕ ===');
    addResponse('Проверяем основные функции...\n');

    for (let i = 0; i < REAL_TEST_COMMANDS.quickTest.length; i++) {
      const cmd = REAL_TEST_COMMANDS.quickTest[i];

      setTimeout(() => {
        let description = '';
        switch (cmd) {
          case 'ATZ':
            description = '(Сброс ELM327)';
            break;
          case 'ATE0':
            description = '(Отключить эхо)';
            break;
          case 'ATSP0':
            description = '(Авто протокол)';
            break;
          case '0100':
            description = '(Проверка связи с ECU)';
            break;
          case '010C':
            description = '(Обороты двигателя)';
            break;
          case '010D':
            description = '(Скорость автомобиля)';
            break;
        }

        addResponse(`\n>>> Тест ${i + 1}/6: ${cmd} ${description}`);
        sendRealCommand(cmd);
      }, i * 2000);
    }
  };

  const runFullDiagnostic = async () => {
    addResponse('\n🔧 === ПОЛНАЯ ДИАГНОСТИКА АВТОМОБИЛЯ ===');
    addResponse('Считываем все доступные данные...\n');

    const allCommands = [
      // Инициализация
      ...REAL_TEST_COMMANDS.initialization,
      // Базовые данные
      '0100',
      '0120',
      '0140', // Поддерживаемые PID
      '010C',
      '010D',
      '0105',
      '010F',
      '0111', // Данные двигателя
      '010A',
      '0142',
      '0143', // Дополнительные данные
      // Информация
      'ATI',
      'ATRV',
      'ATDP',
      // VIN и ошибки
      '0902',
      '03',
      '07',
    ];

    allCommands.forEach((cmd, index) => {
      setTimeout(() => {
        addResponse(`\n>>> Команда ${index + 1}/${allCommands.length}: ${cmd}`);
        sendRealCommand(cmd);
      }, index * 1500);
    });
  };

  const _parseELM327Response = (response: string, cmd: string) => {
    // Парсим реальные ответы от ELM327
    let parsed = '';

    if (cmd === '010C' && response.includes('41 0C')) {
      // RPM расчет
      const match = response.match(/41 0C ([A-F0-9]{2}) ([A-F0-9]{2})/);
      if (match) {
        const A = parseInt(match[1], 16);
        const B = parseInt(match[2], 16);
        const rpm = (A * 256 + B) / 4;
        parsed = `RPM: ${rpm} об/мин`;
      }
    } else if (cmd === '010D' && response.includes('41 0D')) {
      // Скорость
      const match = response.match(/41 0D ([A-F0-9]{2})/);
      if (match) {
        const speed = parseInt(match[1], 16);
        parsed = `Скорость: ${speed} км/ч`;
      }
    } else if (cmd === '0105' && response.includes('41 05')) {
      // Температура охлаждающей жидкости
      const match = response.match(/41 05 ([A-F0-9]{2})/);
      if (match) {
        const temp = parseInt(match[1], 16) - 40;
        parsed = `Температура ОЖ: ${temp}°C`;
      }
    } else if (cmd === '010F' && response.includes('41 0F')) {
      // Температура воздуха
      const match = response.match(/41 0F ([A-F0-9]{2})/);
      if (match) {
        const temp = parseInt(match[1], 16) - 40;
        parsed = `Температура воздуха: ${temp}°C`;
      }
    }

    return parsed;
  };

  const disconnect = async () => {
    if (connectedDevice) {
      try {
        await BleManager.disconnect(connectedDevice);
        setConnectedDevice(null);
        setIsConnected(false);
        setStatus('Отключено от ELM327');
        addResponse('=== СОЕДИНЕНИЕ РАЗОРВАНО ===');
      } catch (error) {
        console.log('Disconnect error:', error);
      }
    }
  };

  const clearLog = () => {
    setResponses([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>🚗 Реальный тест ELM327</Text>
      <Text style={styles.subtitle}>Тестирование в настоящей машине</Text>

      <Text style={styles.status}>{status}</Text>

      {!isConnected ? (
        <View>
          <View style={styles.button}>
            <Button title="🔍 Сканировать ELM327" onPress={scanForELM327} />
          </View>

          <FlatList
            data={devices}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.deviceContainer}>
                <Text style={styles.deviceName}>
                  🚗 {item.name || 'ELM327 Device'}
                </Text>
                <Text style={styles.deviceId}>ID: {item.id}</Text>
                {item.rssi && (
                  <Text style={styles.deviceRssi}>Сигнал: {item.rssi} dBm</Text>
                )}
                <Button
                  title="🔌 Подключиться"
                  onPress={() => connectToELM327(item.id)}
                />
              </View>
            )}
          />

          <View style={styles.helpContainer}>
            <Text style={styles.helpTitle}>⚠️ Перед тестированием:</Text>
            <Text style={styles.helpText}>
              • Заведите машину (двигатель должен работать){'\n'}• Подключите
              ELM327 к OBD порту{'\n'}• Убедитесь что ELM327 в режиме сопряжения
              {'\n'}• Если не находит - попробуйте выключить/включить адаптер
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.connectedContainer}>
          <Text style={styles.connectedText}>✅ Подключено к ELM327</Text>

          <View style={styles.commandContainer}>
            <TextInput
              style={styles.commandInput}
              value={command}
              onChangeText={setCommand}
              placeholder="OBD команда (ATZ, 010C, 010D)"
              placeholderTextColor="#999"
            />
            <Button
              title="Отправить"
              onPress={() => sendRealCommand(command)}
            />
          </View>

          <View style={styles.buttonRow}>
            <Button title="⚡ Быстрый тест" onPress={runQuickTest} />
            <Button title="🔧 Полная диагностика" onPress={runFullDiagnostic} />
          </View>

          <View style={styles.buttonRow}>
            <Button title="🗑️ Очистить лог" onPress={clearLog} />
            <Button
              title="❌ Отключиться"
              onPress={disconnect}
              color="#ff6b6b"
            />
          </View>

          <Text style={styles.responsesTitle}>📡 Лог общения с ELM327:</Text>
          <ScrollView style={styles.responsesContainer}>
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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#000' },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#00ff00',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#ffff00',
    textAlign: 'center',
    marginBottom: 16,
  },
  status: {
    marginBottom: 16,
    fontSize: 16,
    color: '#00ffff',
    textAlign: 'center',
    backgroundColor: '#003333',
    padding: 10,
    borderRadius: 5,
  },
  button: { marginVertical: 8 },
  deviceContainer: {
    backgroundColor: '#001100',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
  },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#00ff00' },
  deviceId: { fontSize: 14, color: '#cccccc', marginTop: 2 },
  deviceRssi: { fontSize: 12, color: '#999999', marginTop: 2, marginBottom: 8 },
  connectedContainer: { flex: 1 },
  connectedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00ff00',
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: '#003300',
    padding: 10,
    borderRadius: 5,
  },
  commandContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'center',
  },
  commandInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#333',
    padding: 10,
    marginRight: 10,
    borderRadius: 5,
    backgroundColor: '#111',
    color: '#fff',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  responsesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#00ffff',
  },
  responsesContainer: {
    flex: 1,
    backgroundColor: '#000',
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#333',
  },
  responseText: {
    color: '#00ff00',
    fontFamily: 'Courier',
    fontSize: 12,
    marginBottom: 2,
  },
  helpContainer: {
    padding: 12,
    backgroundColor: '#330000',
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ff0000',
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff0000',
    marginBottom: 4,
  },
  helpText: {
    fontSize: 12,
    color: '#ffcccc',
    lineHeight: 16,
  },
});

export default RealCarTestApp;
