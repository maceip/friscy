import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, GripVertical } from 'lucide-react';

interface SortableTabProps {
  id: string;
  name: string;
  icon?: string;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}

export const SortableTab: React.FC<SortableTabProps> = ({ 
    id, name, icon, active, onActivate, onClose 
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer transition-all border-t border-x
        ${active 
          ? 'bg-friscy-panel text-friscy-blue border-friscy-border shadow-[0_-4px_12px_rgba(89,194,255,0.05)]' 
          : 'bg-black text-gray-500 border-transparent hover:bg-gray-900'}
      `}
      onClick={onActivate}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:opacity-100 transition-opacity">
        <GripVertical className="w-3 h-3" />
      </div>
      
      {icon && <img src={icon} className="w-3.5 h-3.5 opacity-80 group-hover:opacity-100 transition-opacity" alt="" />}
      
      <span className="text-xs font-bold whitespace-nowrap tracking-tight">{name}</span>
      
      <button 
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="ml-1 p-0.5 hover:bg-red-400/20 rounded text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};
