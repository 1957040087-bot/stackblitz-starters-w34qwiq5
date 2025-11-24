import { Transaction, RecurringItem } from './types';
import { generateUniqueId } from './utils';

export const mockLocalStorage = {
  get: <T extends { id: string }>(key: string): T[] => {
    try {
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      const seenIds = new Set<string>();
      return data.map((item: T) => {
        if (seenIds.has(item.id)) {
          item.id = generateUniqueId();
        }
        seenIds.add(item.id);
        return item;
      });
    } catch (e) {
      return [];
    }
  },

  set: <T>(key: string, data: T[]): void => {
    localStorage.setItem(key, JSON.stringify(data));
  },

  add: <T extends { id?: string }>(key: string, item: T): T => {
    const data = mockLocalStorage.get<T & { id: string }>(key);
    const newItem = { ...item, id: generateUniqueId() } as T & { id: string };
    mockLocalStorage.set(key, [newItem, ...data]);
    return newItem;
  },

  update: <T extends { id: string }>(key: string, id: string, newItem: Partial<T>): void => {
    const data = mockLocalStorage.get<T>(key);
    const index = data.findIndex(i => i.id === id);
    if (index !== -1) {
      data[index] = { ...data[index], ...newItem };
      mockLocalStorage.set(key, data);
    }
  },

  delete: <T extends { id: string }>(key: string, id: string): void => {
    const data = mockLocalStorage.get<T>(key);
    const newData = data.filter(i => i.id !== id);
    mockLocalStorage.set(key, newData);
  }
};
