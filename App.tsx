import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  View,
  Alert,
  TextInput,
  ScrollView,
  DeviceEventEmitter,
  Animated,
  Dimensions,
  StatusBar,
  LinearGradient,
} from 'react-native';
import BleManager, { Peripheral } from 'react-native-ble-manager';

const { width, height } = Dimensions.get('window');

// Импортируем наши реальные команды
const REAL_TEST_COMMANDS = {
  quickTest: ['ATZ', 'ATE0', 'ATSP0', '0100', '010C', '010D'],
  initialization: ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATSP0'],
  basicData: ['010C', '010D', '0105', '010F', '0111'],
  info: ['ATI', 'ATRV', 'ATDP', '0902'],
};

const ModernCarScanner = () => {
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [status, setStatus] = useState('Сканирование ELM327 адаптеров...');
  const [command, setCommand] = useState('');
  const [responses, setResponses] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [scanAnimation] = useState(new Animated.Value(0));
  const [pulseAnimation] = useState(new Animated.Value(1));

  const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

  // Анимации
  useEffect(() => {
    const startScanAnimation = () => {
      Animated.loop(
        Animated.timing(scanAnimation, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
      ).start();
    };

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

    startScanAnimation();
    startPulseAnimation();
  }, []);

  const addResponse = useCallback(response => {
    setResponses(prev => [
      ...prev.slice(-50), // Последние 50 сообщений
      `${new Date().toLocaleTimeString()}: ${response}`,
    ]);
  }, []);

  const scanForELM327 = useCallback(async () => {
    try {
      await BleManager.scan([], 15, true);
      setStatus('🔍 Активное сканирование...');

      setTimeout(async () => {
        const foundDevices = await BleManager.getDiscoveredPeripherals();
        const elm327Devices = foundDevices.filter(
          device =>
            device.name &&
            (device.name.toLowerCase().includes('elm327') ||
              device.name.toLowerCase().includes('obd') ||
              device.name.toLowerCase().includes('can') ||
              device.name.toLowerCase().includes('vgate') ||
              device.name.toLowerCase().includes('veepeak')),
        );

        setDevices(elm327Devices);

        if (elm327Devices.length === 0) {
          setStatus('❌ ELM327 адаптеры не обнаружены');
        } else {
          setStatus(`✨ Найдено адаптеров: ${elm327Devices.length}`);
        }
      }, 15000);
    } catch (error) {
      setStatus('❌ Ошибка сканирования');
    }
  }, []);

  const connectToELM327 = async deviceId => {
    try {
      setStatus('🔗 Подключение...');
      await BleManager.connect(deviceId);
      await BleManager.retrieveServices(deviceId);
      await BleManager.startNotification(deviceId, SERVICE_UUID, TX_UUID);

      setConnectedDevice(deviceId);
      setIsConnected(true);
      setStatus('✅ Подключено успешно');
      addResponse('=== СОЕДИНЕНИЕ УСТАНОВЛЕНО ===');
    } catch (error) {
      setStatus('❌ Ошибка подключения');
      Alert.alert('Ошибка', 'Не удалось подключиться к устройству');
    }
  };

  const sendCommand = async cmd => {
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
      addResponse(`📤 ${cmd}`);
      setCommand('');
    } catch (error) {
      Alert.alert('Ошибка отправки', error.message);
    }
  };

  const runQuickTest = async () => {
    addResponse('\n🚗 === БЫСТРАЯ ДИАГНОСТИКА ===');
    REAL_TEST_COMMANDS.quickTest.forEach((cmd, index) => {
      setTimeout(() => {
        addResponse(`🔧 Выполнение: ${cmd}`);
        sendCommand(cmd);
      }, index * 2000);
    });
  };

  const disconnect = async () => {
    if (connectedDevice) {
      try {
        await BleManager.disconnect(connectedDevice);
        setConnectedDevice(null);
        setIsConnected(false);
        setStatus('Отключено');
        addResponse('=== СОЕДИНЕНИЕ РАЗОРВАНО ===');
      } catch (error) {
        console.log('Disconnect error:', error);
      }
    }
  };

  const StatusIndicator = () => (
    <View style={styles.statusContainer}>
      <Animated.View
        style={[
          styles.statusIndicator,
          {
            backgroundColor: isConnected ? '#00ff88' : '#ff6b6b',
            transform: [{ scale: isConnected ? pulseAnimation : 1 }],
          },
        ]}
      />
      <Text style={styles.statusText}>{status}</Text>
    </View>
  );

  const DeviceCard = ({ item }) => (
    <TouchableOpacity
      style={styles.deviceCard}
      onPress={() => connectToELM327(item.id)}
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

  const ActionButton = ({ title, onPress, icon, variant = 'primary' }) => (
    <TouchableOpacity
      style={[styles.actionButton, styles[`${variant}Button`]]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.actionButtonIcon}>{icon}</Text>
      <Text style={[styles.actionButtonText, styles[`${variant}ButtonText`]]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  useEffect(() => {
    const initialize = async () => {
      try {
        await BleManager.start({ showAlert: false });
        scanForELM327();
      } catch (error) {
        setStatus('❌ Ошибка BLE');
      }
    };

    const listener = DeviceEventEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      ({ characteristic, value }) => {
        if (characteristic === TX_UUID) {
          const response = String.fromCharCode(...value);
          addResponse(`📥 ${response.trim()}`);
        }
      },
    );

    initialize();
    return () => listener.remove();
  }, [addResponse, scanForELM327]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Car Scanner</Text>
        <Text style={styles.subtitle}>Professional OBD2 Diagnostics</Text>
        <StatusIndicator />
      </View>

      {!isConnected ? (
        <View style={styles.scanningContainer}>
          {/* Scanning Animation */}
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

          <TouchableOpacity style={styles.scanButton} onPress={scanForELM327}>
            <Text style={styles.scanButtonText}>🔍 Сканировать устройства</Text>
          </TouchableOpacity>

          {/* Devices List */}
          <FlatList
            data={devices}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <DeviceCard item={item} />}
            style={styles.devicesList}
            showsVerticalScrollIndicator={false}
          />

          {/* Help Section */}
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>💡 Перед подключением:</Text>
            <Text style={styles.helpText}>
              • Заведите автомобиль{'\n'}• Подключите ELM327 к OBD порту{'\n'}•
              Включите Bluetooth на устройстве{'\n'}• Убедитесь в совместимости
              адаптера
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
                placeholder="Введите OBD команду..."
                placeholderTextColor="#666"
              />
              <TouchableOpacity
                style={styles.sendButton}
                onPress={() => sendCommand(command)}
              >
                <Text style={styles.sendButtonText}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsGrid}>
            <ActionButton
              title="Быстрый тест"
              icon="⚡"
              onPress={runQuickTest}
              variant="primary"
            />
            <ActionButton
              title="Диагностика"
              icon="🔧"
              onPress={() => {
                /* TODO */
              }}
              variant="secondary"
            />
            <ActionButton
              title="Очистить лог"
              icon="🗑️"
              onPress={() => setResponses([])}
              variant="tertiary"
            />
            <ActionButton
              title="Отключить"
              icon="❌"
              onPress={disconnect}
              variant="danger"
            />
          </View>

          {/* Response Log */}
          <View style={styles.logContainer}>
            <Text style={styles.logTitle}>📊 Лог диагностики</Text>
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
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64d2ff',
    textAlign: 'center',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#111111',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#333333',
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
  scanningContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  scanningRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#64d2ff',
    borderTopColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 32,
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
    fontSize: 32,
  },
  scanButton: {
    backgroundColor: '#64d2ff',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 25,
    marginBottom: 24,
  },
  scanButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  devicesList: {
    width: '100%',
    marginBottom: 20,
  },
  deviceCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#333333',
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  deviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#64d2ff20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  deviceIconText: {
    fontSize: 24,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  deviceId: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 2,
  },
  deviceRssi: {
    color: '#64d2ff',
    fontSize: 12,
  },
  connectButton: {
    backgroundColor: '#00ff88',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  helpCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: '#333333',
  },
  helpTitle: {
    color: '#64d2ff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  helpText: {
    color: '#cccccc',
    fontSize: 14,
    lineHeight: 22,
  },
  connectedContainer: {
    flex: 1,
    padding: 24,
  },
  commandSection: {
    marginBottom: 24,
  },
  commandInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commandInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#ffffff',
    fontSize: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  sendButton: {
    backgroundColor: '#64d2ff',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  actionButton: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#64d2ff',
  },
  secondaryButton: {
    backgroundColor: '#00ff88',
  },
  tertiaryButton: {
    backgroundColor: '#888888',
  },
  dangerButton: {
    backgroundColor: '#ff6b6b',
  },
  actionButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  primaryButtonText: {
    color: '#000000',
  },
  secondaryButtonText: {
    color: '#000000',
  },
  tertiaryButtonText: {
    color: '#ffffff',
  },
  dangerButtonText: {
    color: '#ffffff',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  logTitle: {
    color: '#64d2ff',
    fontSize: 16,
    fontWeight: 'bold',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  logScroll: {
    flex: 1,
    padding: 16,
  },
  logText: {
    color: '#00ff88',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});

export default ModernCarScanner;
