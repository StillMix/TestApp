import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  View,
  TextInput,
  ScrollView,
  DeviceEventEmitter,
  Animated,
  StatusBar,
} from 'react-native';
import BleManager, { Peripheral } from 'react-native-ble-manager';

// Типы для TypeScript
interface TestCommands {
  quickTest: string[];
  initialization: string[];
  basicData: string[];
  info: string[];
}

interface DeviceCardProps {
  item: Peripheral;
  onConnect: (deviceId: string) => void;
}

interface ActionButtonProps {
  title: string;
  onPress: () => void;
  icon: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

// Импортируем наши реальные команды
const REAL_TEST_COMMANDS: TestCommands = {
  quickTest: ['ATZ', 'ATE0', 'ATSP0', '0100', '010C', '010D'],
  initialization: ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATSP0'],
  basicData: ['010C', '010D', '0105', '010F', '0111'],
  info: ['ATI', 'ATRV', 'ATDP', '0902'],
};

// Компоненты вынесены за пределы основного компонента для оптимизации
const DeviceCard: React.FC<DeviceCardProps> = ({ item, onConnect }) => (
  <TouchableOpacity
    style={styles.deviceCard}
    onPress={() => onConnect(item.id)}
    activeOpacity={0.8}
  >
    <View style={styles.deviceHeader}>
      <View style={styles.deviceIcon}>
        <Text style={styles.deviceIconText}>🚗</Text>
      </View>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.name || 'ELM327 Device'}</Text>
        <Text style={styles.deviceId}>{item.id.substring(0, 17)}...</Text>
        {item.rssi && (
          <Text style={styles.deviceRssi}>Сигнал: {item.rssi} dBm</Text>
        )}
      </View>
    </View>
    <View style={styles.connectButton}>
      <Text style={styles.connectButtonText}>Подключить</Text>
    </View>
  </TouchableOpacity>
);

const ActionButton: React.FC<ActionButtonProps> = ({
  title,
  onPress,
  icon,
  variant = 'primary',
}) => (
  <TouchableOpacity
    style={[
      styles.actionButton,
      styles[`${variant}Button` as keyof typeof styles],
    ]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={styles.actionButtonIcon}>{icon}</Text>
    <Text
      style={[
        styles.actionButtonText,
        styles[`${variant}ButtonText` as keyof typeof styles],
      ]}
    >
      {title}
    </Text>
  </TouchableOpacity>
);

const ModernCarScanner: React.FC = () => {
  const [devices, setDevices] = useState<Peripheral[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Готов к сканированию');
  const [command, setCommand] = useState<string>('');
  const [responses, setResponses] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false); // Новое состояние
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

  const scanForELM327 = useCallback(async () => {
    try {
      setIsScanning(true);
      startScanAnimation();
      setStatus('🔍 Активное сканирование...');

      await BleManager.scan([], 15, true);

      setTimeout(async () => {
        const foundDevices = await BleManager.getDiscoveredPeripherals();
        const elm327Devices = foundDevices.filter(
          (device: Peripheral) =>
            device.name &&
            (device.name.toLowerCase().includes('elm327') ||
              device.name.toLowerCase().includes('obd') ||
              device.name.toLowerCase().includes('can') ||
              device.name.toLowerCase().includes('vgate') ||
              device.name.toLowerCase().includes('veepeak')),
        );

        setDevices(elm327Devices);
        setIsScanning(false);
        stopScanAnimation();

        if (elm327Devices.length === 0) {
          setStatus('❌ ELM327 адаптеры не обнаружены');
        } else {
          setStatus(`✨ Найдено адаптеров: ${elm327Devices.length}`);
        }
      }, 15000);
    } catch (error) {
      setIsScanning(false);
      stopScanAnimation();
      setStatus('❌ Ошибка сканирования');
    }
  }, [startScanAnimation, stopScanAnimation]);

  const connectToELM327 = async (deviceId: string) => {
    try {
      setStatus('🔗 Подключение...');
      await BleManager.connect(deviceId);
      await BleManager.retrieveServices(deviceId);
      await BleManager.startNotification(deviceId, SERVICE_UUID, TX_UUID);

      setConnectedDevice(deviceId);
      setIsConnected(true);
      setStatus('✅ Подключено к ELM327');
      addResponse('✅ Успешное подключение к адаптеру');

      // Автоматическая инициализация
      await runQuickTest();
    } catch (error) {
      setStatus('❌ Ошибка подключения');
      addResponse(
        `❌ Ошибка: ${
          error instanceof Error ? error.message : 'Неизвестная ошибка'
        }`,
      );
    }
  };

  const disconnectDevice = useCallback(() => {
    setIsConnected(false);
    setConnectedDevice(null);
    setDevices([]); // Очищаем список устройств при отключении
    setStatus('Готов к сканированию');
    setIsScanning(false);
    stopScanAnimation();
  }, [stopScanAnimation]);

  const sendCommand = async (cmd: string) => {
    if (!connectedDevice || !cmd.trim()) return;

    try {
      addResponse(`📤 ${cmd.trim()}`);
      const buffer = Buffer.from(cmd.trim() + '\r');
      await BleManager.write(
        connectedDevice,
        SERVICE_UUID,
        RX_UUID,
        Array.from(buffer),
      );
    } catch (error) {
      addResponse(
        `❌ Ошибка отправки: ${
          error instanceof Error ? error.message : 'Неизвестная ошибка'
        }`,
      );
    }
  };

  const runQuickTest = async () => {
    addResponse('🚀 Запуск быстрого теста...');
    for (const cmd of REAL_TEST_COMMANDS.quickTest) {
      await sendCommand(cmd);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  // Компонент кольца сканирования
  const ScanningRing = () => (
    <Animated.View
      style={[
        styles.scanningRing,
        {
          transform: [
            {
              rotate: scanAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg'],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.scanningCenter}>
        <Text style={styles.scanningIcon}>📡</Text>
      </View>
    </Animated.View>
  );

  // Компонент кнопки сканирования
  const ScanButton = () => (
    <TouchableOpacity
      style={[
        styles.scanButton,
        devices.length > 0 && !isConnected ? styles.headerScanButton : {},
      ]}
      onPress={scanForELM327}
      disabled={isScanning}
    >
      <Text
        style={[
          styles.scanButtonText,
          devices.length > 0 && !isConnected ? styles.headerScanButtonText : {},
        ]}
      >
        {isScanning ? '⏱️ Сканирование...' : '🔍 Сканировать'}
      </Text>
    </TouchableOpacity>
  );

  const StatusIndicator = () => (
    <View style={styles.statusContainer}>
      <Animated.View
        style={[
          styles.statusIndicator,
          {
            backgroundColor: isConnected
              ? '#00ff88'
              : isScanning
              ? '#ffaa00'
              : '#ff6b6b',
            transform: [{ scale: isConnected ? pulseAnimation : 1 }],
          },
        ]}
      />
      <Text style={styles.statusText}>{status}</Text>
    </View>
  );

  useEffect(() => {
    const initialize = async () => {
      try {
        await BleManager.start({ showAlert: false });
      } catch (error) {
        setStatus('❌ Ошибка BLE');
      }
    };

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
          addResponse(`📥 ${response.trim()}`);
        }
      },
    );

    initialize();
    return () => listener.remove();
  }, [addResponse]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Car Scanner</Text>
        <Text style={styles.subtitle}>Professional OBD2 Diagnostics</Text>
        <StatusIndicator />

        {/* Хедер с кнопкой сканирования и кольцом когда есть найденные устройства */}
        {devices.length > 0 && !isConnected && (
          <View style={styles.headerControls}>
            {isScanning && <ScanningRing />}
            <ScanButton />
          </View>
        )}
      </View>

      {!isConnected ? (
        <View style={styles.scanningContainer}>
          {/* Показываем кольцо и кнопку в центре только если нет найденных устройств */}
          {devices.length === 0 && (
            <>
              {isScanning && <ScanningRing />}
              <ScanButton />
            </>
          )}

          {/* Devices List */}
          <FlatList
            data={devices}
            keyExtractor={(item: Peripheral) => item.id}
            renderItem={({ item }) => (
              <DeviceCard item={item} onConnect={connectToELM327} />
            )}
            style={styles.devicesList}
            showsVerticalScrollIndicator={false}
          />

          {/* Help Section - показываем только если нет устройств */}
          {devices.length === 0 && (
            <View style={styles.helpCard}>
              <Text style={styles.helpTitle}>💡 Перед подключением:</Text>
              <Text style={styles.helpText}>
                • Заведите автомобиль{'\n'}• Подключите ELM327 к OBD порту{'\n'}
                • Включите Bluetooth на устройстве{'\n'}• Убедитесь в
                совместимости адаптера
              </Text>
            </View>
          )}
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
                placeholder="Введите OBD команду..."
                placeholderTextColor="#666"
              />
              <TouchableOpacity
                style={styles.sendButton}
                onPress={() => sendCommand(command)}
              >
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

export default ModernCarScanner;
