import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MaintenanceItem {
  id: string;
  type: string;
  name: string;
  icon: string;
  intervalKm: number;
  currentMileage: number;
  lastServiceMileage: number;
  nextServiceMileage: number;
  status: 'good' | 'warning' | 'overdue';
  daysLeft?: number;
}

const serviceTypes = [
  { type: 'oil', name: 'Замена масла', icon: '🛢️', intervalKm: 10000 },
  { type: 'filter', name: 'Замена фильтров', icon: '🔧', intervalKm: 15000 },
  { type: 'brake', name: 'Тормозная система', icon: '🛑', intervalKm: 30000 },
  { type: 'tires', name: 'Шины', icon: '🚗', intervalKm: 40000 },
  { type: 'spark', name: 'Свечи зажигания', icon: '⚡', intervalKm: 20000 },
  {
    type: 'coolant',
    name: 'Охлаждающая жидкость',
    icon: '❄️',
    intervalKm: 60000,
  },
];

const calculateItemStatus = (
  item: MaintenanceItem,
  currentMileage: number,
): MaintenanceItem => {
  const nextServiceMileage = item.lastServiceMileage + item.intervalKm;
  const remainingKm = nextServiceMileage - currentMileage;

  let status: 'good' | 'warning' | 'overdue';
  if (remainingKm < 0) {
    status = 'overdue';
  } else if (remainingKm <= item.intervalKm * 0.1) {
    status = 'warning';
  } else {
    status = 'good';
  }

  return {
    ...item,
    currentMileage,
    nextServiceMileage,
    status,
  };
};

interface AddMaintenanceModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (
    item: Omit<MaintenanceItem, 'id' | 'status' | 'nextServiceMileage'>,
  ) => void;
  currentMileage: number;
}

const AddMaintenanceModal: React.FC<AddMaintenanceModalProps> = ({
  visible,
  onClose,
  onAdd,
  currentMileage,
}) => {
  const [selectedType, setSelectedType] = useState<string>('');
  const [customName, setCustomName] = useState<string>('');
  const [customInterval, setCustomInterval] = useState<string>('');
  const [currentMileageVal, setCurrentMileageVal] = useState<string>(
    currentMileage.toString(),
  );
  const [lastServiceMileage, setLastServiceMileage] = useState<string>('');

  const handleAdd = () => {
    if (!selectedType || !lastServiceMileage) {
      Alert.alert('Ошибка', 'Заполните все обязательные поля');
      return;
    }

    const serviceType = serviceTypes.find(s => s.type === selectedType);
    if (!serviceType) return;

    const newItem = {
      type: selectedType,
      name: customName || serviceType.name,
      icon: serviceType.icon,
      intervalKm: customInterval
        ? parseInt(customInterval)
        : serviceType.intervalKm,
      currentMileage: parseInt(currentMileageVal),
      lastServiceMileage: parseInt(lastServiceMileage),
    };

    onAdd(newItem);

    // Сброс формы
    setSelectedType('');
    setCustomName('');
    setCustomInterval('');
    setLastServiceMileage('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Добавить обслуживание</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView
          style={styles.modalContent}
          contentContainerStyle={{ flexGrow: 1 }}
          enableAutomaticScroll={true}
          enableOnAndroid={true}
          extraScrollHeight={100}
          keyboardOpeningTime={250}
          keyboardShouldPersistTaps="handled"
          resetScrollToCoords={{ x: 0, y: 0 }}
        >
          <Text style={styles.sectionTitle}>Выберите тип обслуживания:</Text>
          {serviceTypes.map(service => (
            <TouchableOpacity
              key={service.type}
              style={[
                styles.serviceOption,
                selectedType === service.type && styles.selectedServiceOption,
              ]}
              onPress={() => setSelectedType(service.type)}
            >
              <Text style={styles.serviceIcon}>{service.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>{service.name}</Text>
                <Text style={styles.serviceInterval}>
                  Интервал: {service.intervalKm.toLocaleString()} км
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          {selectedType && (
            <>
              <Text style={styles.sectionTitle}>Настройки:</Text>
              <TextInput
                style={styles.input}
                placeholder="Название (необязательно)"
                placeholderTextColor="#666"
                value={customName}
                onChangeText={setCustomName}
              />
              <TextInput
                style={styles.input}
                placeholder="Интервал в км (необязательно)"
                placeholderTextColor="#666"
                value={customInterval}
                onChangeText={setCustomInterval}
                keyboardType="numeric"
              />

              <Text style={styles.sectionTitle}>Данные пробега:</Text>
              <TextInput
                style={styles.input}
                placeholder="Текущий пробег (км)"
                placeholderTextColor="#666"
                value={currentMileageVal}
                onChangeText={setCurrentMileageVal}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                placeholder="Пробег последнего ТО (км)"
                placeholderTextColor="#666"
                value={lastServiceMileage}
                onChangeText={setLastServiceMileage}
                keyboardType="numeric"
              />

              <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
                <Text style={styles.addButtonText}>Добавить</Text>
              </TouchableOpacity>
            </>
          )}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const CarKeeperScreen: React.FC = () => {
  const [maintenanceItems, setMaintenanceItems] = useState<MaintenanceItem[]>(
    [],
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [currentMileage, setCurrentMileage] = useState<number>(0);
  const [editMileageMode, setEditMileageMode] = useState(false);
  const [tempMileage, setTempMileage] = useState('');

  // Загрузка данных
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const itemsData = await AsyncStorage.getItem('maintenanceItems');
      const mileageData = await AsyncStorage.getItem('currentMileage');

      if (itemsData) {
        const items = JSON.parse(itemsData);
        const updatedItems = items.map((item: MaintenanceItem) =>
          calculateItemStatus(item, currentMileage),
        );
        setMaintenanceItems(updatedItems);
      }

      if (mileageData) {
        setCurrentMileage(parseInt(mileageData));
      }
    } catch (error) {
      console.log('Ошибка загрузки данных:', error);
    }
  };

  const saveData = async (items: MaintenanceItem[], mileage: number) => {
    try {
      await AsyncStorage.setItem('maintenanceItems', JSON.stringify(items));
      await AsyncStorage.setItem('currentMileage', mileage.toString());
    } catch (error) {
      console.log('Ошибка сохранения данных:', error);
    }
  };

  const addMaintenanceItem = (
    newItem: Omit<MaintenanceItem, 'id' | 'status' | 'nextServiceMileage'>,
  ) => {
    const item: MaintenanceItem = {
      ...newItem,
      id: Date.now().toString(),
      status: 'good',
      nextServiceMileage: newItem.lastServiceMileage + newItem.intervalKm,
    };

    const calculatedItem = calculateItemStatus(item, currentMileage);
    const updatedItems = [...maintenanceItems, calculatedItem];

    setMaintenanceItems(updatedItems);
    saveData(updatedItems, currentMileage);
  };

  const updateMileage = () => {
    const newMileage = parseInt(tempMileage);
    if (isNaN(newMileage) || newMileage < 0) {
      Alert.alert('Ошибка', 'Введите корректный пробег');
      return;
    }

    const updatedItems = maintenanceItems.map(item =>
      calculateItemStatus(item, newMileage),
    );

    setCurrentMileage(newMileage);
    setMaintenanceItems(updatedItems);
    setEditMileageMode(false);
    setTempMileage('');
    saveData(updatedItems, newMileage);
  };

  const deleteItem = (id: string) => {
    Alert.alert(
      'Удалить запись',
      'Вы уверены, что хотите удалить эту запись?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            const updatedItems = maintenanceItems.filter(
              item => item.id !== id,
            );
            setMaintenanceItems(updatedItems);
            saveData(updatedItems, currentMileage);
          },
        },
      ],
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return '#00ff88';
      case 'warning':
        return '#ffaa00';
      case 'overdue':
        return '#ff4444';
      default:
        return '#666';
    }
  };

  const getStatusText = (item: MaintenanceItem) => {
    const remaining = item.nextServiceMileage - currentMileage;
    if (remaining < 0) {
      return `Просрочено на ${Math.abs(remaining).toLocaleString()} км`;
    }
    return `Осталось: ${remaining.toLocaleString()} км`;
  };

  const renderMaintenanceItem = ({ item }: { item: MaintenanceItem }) => (
    <View style={styles.maintenanceItem}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemIcon}>{item.icon}</Text>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemInterval}>
            Интервал: {item.intervalKm.toLocaleString()} км
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteItem(item.id)}
        >
          <Text style={styles.deleteButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.itemStatus}>
        <Text
          style={[styles.statusText, { color: getStatusColor(item.status) }]}
        >
          {getStatusText(item)}
        </Text>
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${Math.max(
                  0,
                  Math.min(
                    100,
                    ((currentMileage - item.lastServiceMileage) /
                      item.intervalKm) *
                      100,
                  ),
                )}%`,
                backgroundColor: getStatusColor(item.status),
              },
            ]}
          />
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Car Keeper</Text>

        <View style={styles.mileageContainer}>
          {editMileageMode ? (
            <View style={styles.mileageEditContainer}>
              <TextInput
                style={styles.mileageInput}
                value={tempMileage}
                onChangeText={setTempMileage}
                keyboardType="numeric"
                placeholder={currentMileage.toString()}
                placeholderTextColor="#666"
                autoFocus
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={updateMileage}
              >
                <Text style={styles.saveButtonText}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setEditMileageMode(false);
                  setTempMileage('');
                }}
              >
                <Text style={styles.cancelButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.mileageDisplay}
              onPress={() => {
                setEditMileageMode(true);
                setTempMileage(currentMileage.toString());
              }}
            >
              <Text style={styles.mileageLabel}>Текущий пробег:</Text>
              <Text style={styles.mileageValue}>
                {currentMileage.toLocaleString()} км
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
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
        {maintenanceItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🚗</Text>
            <Text style={styles.emptyStateTitle}>
              Добро пожаловать в Car Keeper!
            </Text>
            <Text style={styles.emptyStateText}>
              Добавьте первую запись об обслуживании вашего автомобиля
            </Text>
          </View>
        ) : (
          <FlatList
            data={maintenanceItems}
            renderItem={renderMaintenanceItem}
            keyExtractor={item => item.id}
            style={styles.maintenanceList}
            scrollEnabled={false} // Отключаем скролл у FlatList
          />
        )}
      </KeyboardAwareScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Modal */}
      <AddMaintenanceModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdd={addMaintenanceItem}
        currentMileage={currentMileage}
      />
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
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  mileageContainer: {
    alignItems: 'center',
  },
  mileageDisplay: {
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#333',
  },
  mileageEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mileageInput: {
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#00ff88',
    textAlign: 'center',
    minWidth: 120,
  },
  saveButton: {
    backgroundColor: '#00ff88',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#ff4444',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  mileageLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 5,
  },
  mileageValue: {
    color: '#00ff88',
    fontSize: 24,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyStateTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyStateText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  maintenanceList: {
    flexGrow: 0,
  },
  maintenanceItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  itemIcon: {
    fontSize: 30,
    marginRight: 15,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  itemInterval: {
    color: '#888',
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemStatus: {
    gap: 10,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00ff88',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabText: {
    color: '#000',
    fontSize: 24,
    fontWeight: 'bold',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    color: '#ff6b6b',
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  serviceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedServiceOption: {
    borderColor: '#00ff88',
  },
  serviceIcon: {
    fontSize: 20,
    marginRight: 15,
  },
  serviceName: {
    color: '#ffffff',
    fontSize: 14,
    flex: 1,
  },
  serviceInterval: {
    color: '#888',
    fontSize: 12,
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  addButton: {
    backgroundColor: '#00ff88',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 20,
    marginBottom: 40,
  },
  addButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default CarKeeperScreen;
