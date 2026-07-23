/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useServices } from '../context/ServiceContext';

interface NotesModalProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
}

export const NotesModal: React.FC<NotesModalProps> = ({ symbol, isOpen, onClose }) => {
  const { getNotes, saveNotes } = useServices();
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const load = async () => {
        const savedNotes = await getNotes(symbol);
        setNotes(savedNotes);
        setHasChanges(false);
      };
      load();
    }
  }, [isOpen, symbol, getNotes]);

  const handleSave = async () => {
    setIsSaving(true);
    await saveNotes(symbol, notes);
    setIsSaving(false);
    setHasChanges(false);
  };

  const handleClear = () => {
    if (confirm('Clear all notes for this symbol?')) {
      setNotes('');
      setHasChanges(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#1c202d] border border-[#242733] w-full max-w-md rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-[#242733] bg-[#131722]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#26a69a]/10 rounded-lg text-[#26a69a]">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">{symbol} Notes</h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Personal Research</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-gray-400 hover:text-white hover:bg-[#2a2e39] rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 p-4 overflow-hidden flex flex-col">
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setHasChanges(true);
            }}
            placeholder="Type your notes here... (e.g. key levels, earnings dates, thesis)"
            className="flex-1 w-full bg-[#131722] border border-[#242733] text-gray-200 p-4 rounded-lg focus:outline-none focus:border-[#26a69a] resize-none text-sm font-sans min-h-[300px]"
          />
        </div>

        <div className="px-4 py-3 bg-[#131722] border-t border-[#242733] flex items-center justify-between">
          <button 
            onClick={handleClear}
            className="p-2 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
            title="Clear Notes"
          >
            <Trash2 size={18} />
          </button>
          
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-gray-400 text-sm hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg ${
                hasChanges && !isSaving
                  ? "bg-[#26a69a] text-white hover:bg-[#2bbbad]"
                  : "bg-[#2a2e39] text-gray-500 cursor-not-allowed"
              }`}
            >
              <Save size={16} className={isSaving ? 'animate-pulse' : ''} />
              {isSaving ? 'Saving...' : 'Save Notes'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
