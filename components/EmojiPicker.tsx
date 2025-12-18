
import React from 'react';
import { Modal } from './components';

const EMOJI_GROUPS = [
  {
    name: "Ekonomi",
    emojis: ["💰", "💳", "🏦", "📈", "📉", "💎", "⚖️", "🏛️", "💵", "💸", "🪙", "💹", "🧾", "🧧"]
  },
  {
    name: "Boende & Hem",
    emojis: ["🏠", "🏢", "🏘️", "🛋️", "🛌", "🚿", "🛁", "🧼", "🧹", "🕯️", "🔌", "📶", "🔥", "💧", "🔑", "🔨", "🪴"]
  },
  {
    name: "Mat & Dryck",
    emojis: ["🛒", "🥦", "🍎", "🍕", "🍔", "🍣", "🌮", "🍰", "☕", "🍺", "🍷", "🥤", "🍦", "🍳"]
  },
  {
    name: "Transport",
    emojis: ["🚗", "🚲", "🚇", "🚌", "✈️", "🚢", "⛽", "🅿️", "🚕", "🛴", "🔋", "🚂", "🏔️", "🗺️"]
  },
  {
    name: "Livsstil & Nöje",
    emojis: ["🎮", "🎬", "🍿", "🎭", "🎨", "🎤", "🎧", "📷", "📱", "💻", "📺", "👕", "👗", "👟", "💍", "⚽", "🏋️‍♀️", "🧘‍♂️", "🧶", "🧸"]
  },
  {
    name: "Barn & Familj",
    emojis: ["👶", "🧒", "👨‍👩‍👧‍👦", "🍼", "🎒", "🎓", "🎢", "🎡", "🏰", "🐕", "🐈", "🦒", "🦋"]
  },
  {
    name: "Hälsa & Trygghet",
    emojis: ["🏥", "💊", "🦷", "💇‍♀️", "🧴", "🧖‍♀️", "🛡️", "🆘", "🚑", "🩺", "👓", "🌂"]
  }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  title?: string;
}

export const EmojiPickerModal: React.FC<Props> = ({ isOpen, onClose, onSelect, title = "Välj Ikon" }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1 no-scrollbar">
        {EMOJI_GROUPS.map(group => (
          <div key={group.name} className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">{group.name}</h4>
            <div className="grid grid-cols-6 gap-2">
              {group.emojis.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    onSelect(emoji);
                    onClose();
                  }}
                  className="w-full aspect-square flex items-center justify-center text-2xl hover:bg-slate-700/50 rounded-xl transition-all active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};
