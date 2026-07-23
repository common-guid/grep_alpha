/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useServices } from '../context/ServiceContext';
import { X, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useServices();
  const [form, setForm] = useState(settings);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(form);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#1c202d] border border-[#242733] w-full max-w-md rounded-lg shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-[#242733]">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Preferred API</label>
            <select 
              value={form.preferredApi}
              onChange={e => setForm({ ...form, preferredApi: e.target.value as any })}
              className="w-full bg-[#131722] border border-[#242733] text-white p-2 rounded focus:outline-none focus:border-[#26a69a]"
            >
              <option value="alphavantage">Alpha Vantage</option>
              <option value="alpaca">Alpaca</option>
            </select>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-gray-200">Alpha Vantage</h3>
            <input 
              type="password"
              placeholder="API Key"
              value={form.alphaVantageKey}
              onChange={e => setForm({ ...form, alphaVantageKey: e.target.value })}
              className="w-full bg-[#131722] border border-[#242733] text-white p-2 rounded focus:outline-none focus:border-[#26a69a] text-sm"
            />
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-gray-200">Alpaca</h3>
            <input 
              type="text"
              placeholder="API Key ID"
              value={form.alpacaKey}
              onChange={e => setForm({ ...form, alpacaKey: e.target.value })}
              className="w-full bg-[#131722] border border-[#242733] text-white p-2 rounded focus:outline-none focus:border-[#26a69a] text-sm"
            />
            <input 
              type="password"
              placeholder="Secret Key"
              value={form.alpacaSecret}
              onChange={e => setForm({ ...form, alpacaSecret: e.target.value })}
              className="w-full bg-[#131722] border border-[#242733] text-white p-2 rounded focus:outline-none focus:border-[#26a69a] text-sm"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 bg-[#26a69a] text-white text-sm font-bold rounded hover:bg-[#2bbbad] flex items-center gap-2"
            >
              <Save size={16} />
              Save Changes
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
