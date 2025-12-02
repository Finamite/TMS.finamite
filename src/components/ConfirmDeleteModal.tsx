import { Trash2, X } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const ConfirmDeleteModal = ({
  open,
  message = "Are you sure you want to delete this?",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const { isDark } = useTheme();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Background blur */}
      <div
        className="absolute inset-0 bg-black bg-opacity-40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal Body */}
      <div
        className={`relative w-full max-w-md rounded-xl shadow-2xl p-6 transform transition-all scale-100
        ${isDark ? "bg-[--color-surface] border border-[--color-border]" : "bg-white border border-gray-300"}`}
      >
        {/* Close Button */}
        <button
          onClick={onCancel}
          className={`absolute top-3 right-3 p-1 rounded-lg transition-colors
          ${isDark ? "text-gray-300 hover:bg-gray-700" : "text-gray-600 hover:bg-gray-100"}`}
        >
          <X size={20} />
        </button>

        {/* Icon + Title */}
        <div className="flex items-center justify-center mb-4">
          <div
            className={`p-4 rounded-full 
            ${isDark ? "bg-red-900/40 border border-red-700" : "bg-red-50 border border-red-200"}`}
          >
            <Trash2 size={32} className={`${isDark ? "text-red-300" : "text-red-600"}`} />
          </div>
        </div>

        <h2
          className={`text-xl font-semibold text-center mb-2
          ${isDark ? "text-[--color-text]" : "text-gray-900"}`}
        >
          Confirm Delete
        </h2>

        <p
          className={`text-center text-sm mb-6 leading-relaxed
          ${isDark ? "text-[--color-textSecondary]" : "text-gray-600"}`}
        >
          {message}
        </p>

        {/* Buttons */}
        <div className="flex justify-center gap-4">
          <button
            onClick={onCancel}
            className={`px-5 py-2 rounded-lg border text-sm font-medium transition-colors
            ${isDark
              ? "border-[--color-border] text-[--color-text] hover:bg-gray-700"
              : "border-gray-300 text-gray-700 hover:bg-gray-100"}`}
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            className={`px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors
            ${isDark
              ? "bg-red-600 hover:bg-red-700"
              : "bg-red-600 hover:bg-red-700"}`}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
