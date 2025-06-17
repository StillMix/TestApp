import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MaintenanceItem {
  id: string;
  type: string;
  name: string;
  currentMileage: number;
  lastServiceMileage: number;
  serviceInterval: number;
  nextServiceMileage: number;
  lastServiceDate: string;
  icon: string;
  isOverdue: boolean;
  urgencyLevel: 'low' | 'medium' | 'high';
}

interface AddServiceModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (item: Partial<MaintenanceItem>) => void;
}

const predefinedServices = [
  { type: 'oil', name: 'Замена моторного масла', interval: 10000, icon: '🛢️' },
  {
    type: 'filter_oil',
    name: 'Замена масляного фильтра',
    interval: 10000,
    icon: '🔧',
  },
  {
    type: 'filter_air',
    name: 'Замена воздушного фильтра',
    interval: 20000,
    icon: '💨',
  },
  {
    type: 'filter_fuel',
    name: 'Замена топливного фильтра',
    interval: 30000,
    icon: '⛽',
  },
  {
    type: 'brake_fluid',
    name: 'Замена тормозной жидкости',
    interval: 40000,
    icon: '🚫',
  },
  {
    type: 'coolant',
    name: 'Замена охлаждающей жидкости',
    interval: 50000,
    icon: '❄️',
  },
  {
    type: 'spark_plugs',
    name: 'Замена свечей зажигания',
    interval: 30000,
    icon: '⚡',
  },
  {
    type: 'brake_pads',
    name: 'Замена тормозных колодок',
    interval: 25000,
    icon: '🛡️',
  },
  { type: 'tires', name: 'Замена шин', interval: 60000, icon: '🛞' },
  {
    type: 'transmission',
    name: 'ТО коробки передач',
    interval: 60000,
    icon: '⚙️',
  },
];

const AddServiceModal: React.FC<AddServiceModalProps> = ({
  visible,
  onClose,
  onAdd,
}) => {
  const [selectedService, setSelectedService] = useState<any>(null);
  const [currentMileage, setCurrentMileage] = useState('');
  const [lastServiceMileage, setLastServiceMileage] = useState('');
  const [customName, setCustomName] = useState('');
  const [customInterval, setCustomInterval] = useState('');

  const handleAdd = () => {
    if (!selectedService && !customName) {
      Alert.alert('Ошибка', 'Выберите услугу или введите название');
      return;
    }

    if (!currentMileage || !lastServiceMileage) {
      Alert.alert('Ошибка', 'Введите текущий пробег и пробег последнего ТО');
      return;
    }

    const currentMiles = parseInt(currentMileage);
    const lastMiles = parseInt(lastServiceMileage);
    const interval = selectedService
      ? selectedService.interval
      : parseInt(customInterval);

    if (isNaN(currentMiles) || isNaN(lastMiles) || isNaN(interval)) {
      Alert.alert('Ошибка', 'Введите корректные числовые значения');
      return;
    }

    const newItem: Partial<MaintenanceItem> = {
      id: Date.now().toString(),
      type: selectedService ? selectedService.type : 'custom',
      name: selectedService ? selectedService.name : customName,
      currentMileage: currentMiles,
      lastServiceMileage: lastMiles,
      serviceInterval: interval,
      nextServiceMileage: lastMiles + interval,
      lastServiceDate: new Date().toISOString().split('T')[0],
      icon: selectedService ? selectedService.icon : '🔧',
    };

    onAdd(newItem);

    // Сброс формы
    setSelectedService(null);
    setCurrentMileage('');
    setLastServiceMileage('');
    setCustomName('');
    setCustomInterval('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Добавить услугу ТО</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <Text style={styles.sectionTitle}>Выберите тип ТО:</Text>

          {predefinedServices.map(service => (
            <TouchableOpacity
              key={service.type}
              style={[
                styles.serviceOption,
                selectedService?.type === service.type &&
                  styles.selectedServiceOption,
              ]}
              onPress={() => setSelectedService(service)}
            >
              <Text style={styles.serviceIcon}>{service.icon}</Text>
              <Text style={styles.serviceName}>{service.name}</Text>
              <Text style={styles.serviceInterval}>{service.interval} км</Text>
            </TouchableOpacity>
          ))}

          <Text style={styles.sectionTitle}>Или создайте свою:</Text>
          <TextInput
            style={styles.input}
            placeholder="Название услуги"
            placeholderTextColor="#666"
            value={customName}
            onChangeText={setCustomName}
          />
          <TextInput
            style={styles.input}
            placeholder="Интервал обслуживания (км)"
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
            value={currentMileage}
            onChangeText={setCurrentMileage}
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
        </ScrollView>
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

  const calculateItemStatus = (
    item: MaintenanceItem,
    currentMiles: number,
  ): MaintenanceItem => {
    const remainingMileage = item.nextServiceMileage - currentMiles;
    const isOverdue = remainingMileage <= 0;

    let urgencyLevel: 'low' | 'medium' | 'high' = 'low';
    if (isOverdue) {
      urgencyLevel = 'high';
    } else if (remainingMileage <= item.serviceInterval * 0.1) {
      urgencyLevel = 'high';
    } else if (remainingMileage <= item.serviceInterval * 0.2) {
      urgencyLevel = 'medium';
    }

    return {
      ...item,
      currentMileage: currentMiles,
      isOverdue,
      urgencyLevel,
    };
  };

  const addMaintenanceItem = (newItem: Partial<MaintenanceItem>) => {
    const item = calculateItemStatus(
      newItem as MaintenanceItem,
      currentMileage,
    );
    const updatedItems = [...maintenanceItems, item];
    setMaintenanceItems(updatedItems);
    saveData(updatedItems, currentMileage);
  };

  const updateMileage = () => {
    const newMileage = parseInt(tempMileage);
    if (isNaN(newMileage) || newMileage < 0) {
      Alert.alert('Ошибка', 'Введите корректное значение пробега');
      return;
    }

    const updatedItems = maintenanceItems.map(item =>
      calculateItemStatus(item, newMileage),
    );
    setMaintenanceItems(updatedItems);
    setCurrentMileage(newMileage);
    setEditMileageMode(false);
    setTempMileage('');
    saveData(updatedItems, newMileage);
  };

  const markAsCompleted = (itemId: string) => {
    Alert.alert('Подтверждение', 'Отметить как выполненное?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Да',
        onPress: () => {
          const updatedItems = maintenanceItems.map(item => {
            if (item.id === itemId) {
              return calculateItemStatus(
                {
                  ...item,
                  lastServiceMileage: currentMileage,
                  nextServiceMileage: currentMileage + item.serviceInterval,
                  lastServiceDate: new Date().toISOString().split('T')[0],
                },
                currentMileage,
              );
            }
            return item;
          });
          setMaintenanceItems(updatedItems);
          saveData(updatedItems, currentMileage);
        },
      },
    ]);
  };

  const deleteItem = (itemId: string) => {
    Alert.alert('Удаление', 'Удалить запись?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          const updatedItems = maintenanceItems.filter(
            item => item.id !== itemId,
          );
          setMaintenanceItems(updatedItems);
          saveData(updatedItems, currentMileage);
        },
      },
    ]);
  };

  const getUrgencyColor = (urgency: 'low' | 'medium' | 'high') => {
    switch (urgency) {
      case 'high':
        return '#ff6b6b';
      case 'medium':
        return '#ffaa00';
      case 'low':
        return '#00ff88';
      default:
        return '#666';
    }
  };

  const renderMaintenanceItem = ({ item }: { item: MaintenanceItem }) => {
    const remainingMileage = item.nextServiceMileage - currentMileage;

    return (
      <View
        style={[
          styles.itemCard,
          { borderLeftColor: getUrgencyColor(item.urgencyLevel) },
        ]}
      >
        <View style={styles.itemHeader}>
          <Text style={styles.itemIcon}>{item.icon}</Text>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemDetails}>
              Интервал: {item.serviceInterval.toLocaleString()} км
            </Text>
            <Text style={styles.itemDetails}>
              Последнее ТО: {item.lastServiceMileage.toLocaleString()} км
            </Text>
          </View>
        </View>

        <View style={styles.itemStatus}>
          {remainingMileage > 0 ? (
            <Text
              style={[
                styles.remainingText,
                { color: getUrgencyColor(item.urgencyLevel) },
              ]}
            >
              Осталось: {remainingMileage.toLocaleString()} км
            </Text>
          ) : (
            <Text style={styles.overdueText}>
              Просрочено на {Math.abs(remainingMileage).toLocaleString()} км
            </Text>
          )}
        </View>

        <View style={styles.itemActions}>
          <TouchableOpacity
            style={styles.completeButton}
            onPress={() => markAsCompleted(item.id)}
          >
            <Text style={styles.completeButtonText}>✓ Выполнено</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteItem(item.id)}
          >
            <Text style={styles.deleteButtonText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const overdueCount = maintenanceItems.filter(item => item.isOverdue).length;
  const soonCount = maintenanceItems.filter(
    item => !item.isOverdue && item.urgencyLevel === 'high',
  ).length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🚗 Car Keeper</Text>
        <Text style={styles.subtitle}>Техническое обслуживание</Text>

        {/* Current Mileage */}
        <View style={styles.mileageContainer}>
          {editMileageMode ? (
            <View style={styles.mileageEditContainer}>
              <TextInput
                style={styles.mileageInput}
                value={tempMileage}
                onChangeText={setTempMileage}
                placeholder={currentMileage.toString()}
                placeholderTextColor="#666"
                keyboardType="numeric"
                autoFocus
              />
              <TouchableOpacity
                style={styles.mileageSaveButton}
                onPress={updateMileage}
              >
                <Text style={styles.mileageSaveText}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mileageCancelButton}
                onPress={() => {
                  setEditMileageMode(false);
                  setTempMileage('');
                }}
              >
                <Text style={styles.mileageCancelText}>✕</Text>
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
              <Text style={styles.mileageText}>
                📊 Пробег: {currentMileage.toLocaleString()} км
              </Text>
              <Text style={styles.mileageEdit}>✏️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status Summary */}
        <View style={styles.summaryContainer}>
          {overdueCount > 0 && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryIcon}>🚨</Text>
              <Text style={styles.summaryText}>Просрочено: {overdueCount}</Text>
            </View>
          )}
          {soonCount > 0 && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryIcon}>⚠️</Text>
              <Text style={styles.summaryText}>Скоро: {soonCount}</Text>
            </View>
          )}
          {overdueCount === 0 &&
            soonCount === 0 &&
            maintenanceItems.length > 0 && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryIcon}>✅</Text>
                <Text style={styles.summaryText}>Всё в порядке</Text>
              </View>
            )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {maintenanceItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔧</Text>
            <Text style={styles.emptyTitle}>
              Добро пожаловать в Car Keeper!
            </Text>
            <Text style={styles.emptyText}>
              Начните отслеживать техническое обслуживание вашего автомобиля
            </Text>
          </View>
        ) : (
          <FlatList
            data={maintenanceItems.sort((a, b) => {
              if (a.isOverdue && !b.isOverdue) return -1;
              if (!a.isOverdue && b.isOverdue) return 1;
              if (a.urgencyLevel === 'high' && b.urgencyLevel !== 'high')
                return -1;
              if (a.urgencyLevel !== 'high' && b.urgencyLevel === 'high')
                return 1;
              return (
                a.nextServiceMileage -
                a.currentMileage -
                (b.nextServiceMileage - b.currentMileage)
              );
            })}
            renderItem={renderMaintenanceItem}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
          />
        )}
      </View>

      {/* Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add Service Modal */}
      <AddServiceModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdd={addMaintenanceItem}
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
  mileageContainer: {
    marginTop: 15,
  },
  mileageDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
  },
  mileageText: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: '600',
  },
  mileageEdit: {
    marginLeft: 10,
    fontSize: 16,
  },
  mileageEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mileageInput: {
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    flex: 1,
    textAlign: 'center',
  },
  mileageSaveButton: {
    backgroundColor: '#00ff88',
    marginLeft: 10,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
  },
  mileageSaveText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  mileageCancelButton: {
    backgroundColor: '#ff6b6b',
    marginLeft: 5,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
  },
  mileageCancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginHorizontal: 5,
    marginVertical: 2,
  },
  summaryIcon: {
    fontSize: 14,
    marginRight: 5,
  },
  summaryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  listContainer: {
    padding: 20,
  },
  itemCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  itemDetails: {
    color: '#888',
    fontSize: 12,
    marginBottom: 2,
  },
  itemStatus: {
    marginBottom: 10,
  },
  remainingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  overdueText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completeButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
  },
  completeButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  deleteButton: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 10,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
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
