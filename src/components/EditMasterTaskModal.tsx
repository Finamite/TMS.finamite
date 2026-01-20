import React, { Dispatch, SetStateAction, memo } from "react";
import { CreditCard as Edit, Save, X } from "lucide-react";
import { toast } from "react-toastify";

interface User {
  _id: string;
  username: string;
  email: string;
}

interface MasterTask {
  taskGroupId: string;
  title: string;
  description: string;
  taskType: string;
  assignedBy: { username: string; email: string };
  assignedTo: {
    _id: any;
    username: string;
    email: string;
  };
  priority: string;
  parentTaskInfo?: {
    [x: string]: any;
    originalStartDate?: string;
    originalEndDate?: string;
    includeSunday: boolean;
    isForever: boolean;
    weeklyDays?: number[];
    weekOffDays?: number[];
    monthlyDay?: number;
    yearlyDuration?: number;
  };
  weekOffDays?: number[];
  dateRange: {
    start: string;
    end: string;
  };
}

interface EditFormData {
  title: string;
  description: string;
  priority: string;
  assignedTo: string;
  taskType: string;
  startDate: string;
  endDate: string;
  isForever: boolean;
  includeSunday: boolean;
  weeklyDays: number[];
  monthlyDay?: number;
  yearlyDuration: number;
  weekOffDays: number[];

  // ✅ NEW: store reason for early end
  endedEarlyReason?: string;
}

interface EditMasterTaskModalProps {
  showEditModal: boolean;
  editingMasterTask: MasterTask | null;
  editFormData: EditFormData;
  setEditFormData: Dispatch<SetStateAction<EditFormData>>;

  // ✅ toggle state comes from parent
  endRecurrenceEarly: boolean;
  setEndRecurrenceEarly: React.Dispatch<React.SetStateAction<boolean>>;

  users: User[];
  isAdmin: boolean;
  isSaving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

const EditMasterTaskModal: React.FC<EditMasterTaskModalProps> = memo(
  ({
    showEditModal,
    editingMasterTask,
    editFormData,
    setEditFormData,
    users,
    isAdmin,
    isSaving,
    onSave,
    onCancel,
    endRecurrenceEarly,
    setEndRecurrenceEarly
  }) => {
    const [showEndEarlyNotice, setShowEndEarlyNotice] = React.useState(false);

    // ✅ Reason modal states
    const [showReasonModal, setShowReasonModal] = React.useState(false);
    const [endedEarlyReason, setEndedEarlyReason] = React.useState("");
    const [pendingEndDate, setPendingEndDate] = React.useState<string>("");

    // ✅ original end date from master task
    const originalEndDate =
      editingMasterTask?.dateRange?.end ||
      editingMasterTask?.parentTaskInfo?.originalEndDate;

    if (!showEditModal || !editingMasterTask) return null;

    const handleSave = async () => {
      await onSave();
    };

    const formatDateIST = (date: string | Date) => {
      const d = new Date(date);
      return d.toLocaleDateString("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    };

    const formatDateISTShort = (date: string | Date) => {
      const d = new Date(date);
      return d.toLocaleDateString("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    };


    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="bg-[--color-surface] rounded-xl max-w-4xl w-full max-h-[90vh] shadow-2xl transform transition-all overflow-hidden">
          <div className="p-6 border-b border-[--color-border]">
            <h3 className="text-xl font-semibold flex items-center text-[--color-text]">
              <Edit size={24} className="mr-3" />
              Edit Master Task: {editingMasterTask.title}
            </h3>
          </div>

          <div className="p-6 max-h-[65vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-[--color-text] mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={editFormData.title || ""}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, title: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text]"
                  placeholder="Enter task title"
                />
              </div>

              {/* Task Type */}
              <div>
                <label className="block text-sm font-medium text-[--color-text] mb-2">
                  Task Type *
                </label>
                <select
                  value={editFormData.taskType || ""}
                  disabled
                  className="w-full px-4 py-3 border border-[--color-border] rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                >
                  <option value="">Select Type</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-[--color-text] mb-2">
                  Priority *
                </label>
                <select
                  value={editFormData.priority || ""}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, priority: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text]"
                >
                  <option value="">Select Priority</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Assigned To */}
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-[--color-text] mb-2">
                    Assigned To *
                  </label>
                  <select
                    value={editFormData.assignedTo || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        assignedTo: e.target.value
                      })
                    }
                    className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text]"
                  >
                    <option value="">Select User</option>
                    {users.map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.username}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-[--color-text] mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={editFormData.startDate?.split("T")[0] || ""}
                  disabled
                  className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text] disabled:opacity-50"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-[--color-text] mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={editFormData.endDate?.split("T")[0] || ""}
                  disabled={isSaving}
                  readOnly={!endRecurrenceEarly}
                  max={originalEndDate?.split("T")[0]}
                  onClick={(e) => {
                    if (!endRecurrenceEarly) {
                      e.preventDefault();
                      return;
                    }
                    // ✅ Force calendar open
                    (e.currentTarget as any).showPicker?.();
                  }}
                  onChange={(e) => {
                    const picked = e.target.value;

                    // ✅ hard stop if user tries > original
                    if (originalEndDate && new Date(picked) > new Date(originalEndDate)) {
                      alert("New end date cannot be later than original end date.");
                      return;
                    }

                    // ✅ If early end toggle ON, open reason modal
                    if (endRecurrenceEarly) {
                      setPendingEndDate(picked);
                      setShowReasonModal(true);
                      return;
                    }

                    setEditFormData({ ...editFormData, endDate: picked });
                  }}
                  className={`w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text]
                    ${!endRecurrenceEarly ? "opacity-50 cursor-not-allowed" : ""}`}
                />

                {endRecurrenceEarly && (
                  <p className="text-xs text-[--color-muted] mt-1">
                    You cannot select a date later than the original end date.
                  </p>
                )}
              </div>

              {/* End recurrence early toggle */}
              {isAdmin && (
                <div className="md:col-span-2 mt-4 rounded-2xl border-2 border-yellow-600/70 bg-yellow-50/80 dark:border-yellow-400/40 dark:bg-yellow-500/10 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[--color-text]">
                        End recurring task early
                      </p>
                      <p className="text-xs text-[--color-muted] mt-0.5">
                        Stop generating future tasks after a selected date
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        const next = !endRecurrenceEarly;
                        setEndRecurrenceEarly(next);

                        if (!next) {
                          setEndedEarlyReason("");
                          setPendingEndDate("");

                          setEditFormData({
                            ...editFormData,
                            endDate:
                              originalEndDate?.split("T")[0] ||
                              editFormData.endDate?.split("T")[0] ||
                              ""
                          });
                        }

                        if (next) setShowEndEarlyNotice(true);
                      }}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition border-2
          ${endRecurrenceEarly
                          ? "bg-[--color-primary] border-[--color-primary]"
                          : "bg-gray-200 border-gray-500"
                        }
          ${isSaving ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"}`}
                      title="End recurring task early"
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full transition shadow-sm border-2
            ${endRecurrenceEarly
                            ? "translate-x-6 bg-white border-white"
                            : "translate-x-1 bg-white border-gray-500"
                          }`}
                      />
                    </button>
                  </div>
                </div>
              )}


              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[--color-text] mb-2">
                  Description
                </label>
                <textarea
                  value={editFormData.description || ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      description: e.target.value
                    })
                  }
                  rows={4}
                  className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text]"
                  placeholder="Enter task description"
                />
              </div>

              {/* Forever & Sunday */}
              <div className="md:col-span-2">
                <div className="flex items-center space-x-6 mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editFormData.isForever || false}
                      disabled
                      className="w-4 h-4 text-[--color-primary] border-[--color-border] rounded focus:ring-[--color-primary]"
                    />
                    <span className="ml-2 text-sm font-medium text-[--color-text]">
                      Forever Task
                    </span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editFormData.includeSunday ?? true}
                      disabled
                      className="w-4 h-4 text-[--color-primary] border-[--color-border] rounded focus:ring-[--color-primary]"
                    />
                    <span className="ml-2 text-sm font-medium text-[--color-text]">
                      Include Sunday
                    </span>
                  </label>
                </div>
              </div>

              {/* Week Off Days */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[--color-text] mb-3">
                  Week Off Days
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => {
                    const currentWeekOffDays = editFormData.weekOffDays || [];
                    const isSelected = currentWeekOffDays.includes(i);

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const newDays = isSelected
                            ? currentWeekOffDays.filter((d: number) => d !== i)
                            : [...currentWeekOffDays, i].sort((a, b) => a - b);

                          setEditFormData({
                            ...editFormData,
                            weekOffDays: newDays
                          });
                        }}
                        className={`px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 border-2 ${isSelected
                          ? "bg-[--color-primary] border-[--color-primary] text-white shadow-md transform scale-105"
                          : "bg-[--color-background] border-[--color-border] text-[--color-text] hover:border-[--color-primary] hover:shadow-sm"
                          }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="p-6 border-t border-[--color-border] flex justify-end space-x-3">
            <button
              onClick={onCancel}
              className="px-6 py-3 text-sm font-medium text-[--color-text] bg-[--color-surface] border border-[--color-border] rounded-lg hover:bg-[--color-background] transition-colors"
            >
              <X size={16} className="inline mr-2" />
              Cancel
            </button>

            <button
              onClick={handleSave}
              disabled={
                isSaving ||
                !editFormData.title ||
                !editFormData.taskType ||
                !editFormData.priority ||
                (endRecurrenceEarly && !editFormData.endedEarlyReason?.trim())
              }
              className={`px-6 py-3 text-sm font-medium text-white bg-[--color-primary] rounded-lg transition-colors ${isSaving ||
                !editFormData.title ||
                !editFormData.taskType ||
                !editFormData.priority
                ? "opacity-60 cursor-not-allowed"
                : "hover:bg-[--color-primary] hover:scale-105"
                }`}
            >
              <Save size={16} className="inline mr-2" />
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Notice Modal */}
        {showEndEarlyNotice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowEndEarlyNotice(false)}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md rounded-2xl border border-[--color-border] bg-[--color-surface] shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="p-5 border-b border-[--color-border] flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[--color-error]/15 text-[--color-error] text-lg">
                    ⚠️
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[--color-text]">
                      Important Notice
                    </h3>
                    <p className="text-xs text-[--color-muted] mt-0.5">
                      Ending recurrence early rules
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowEndEarlyNotice(false)}
                  className="h-9 w-9 rounded-full border border-[--color-border] flex items-center justify-center hover:bg-[--color-background] transition text-[--color-text]"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                <p className="text-sm text-[--color-text] leading-relaxed">
                  You are allowed to <span className="font-semibold">end a recurring task earlier</span>{" "}
                  than its originally scheduled end date.
                </p>

                <div className="rounded-2xl border border-[--color-border] bg-[--color-background] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[--color-muted]">
                      Original end date
                    </p>
                    <p className="text-sm font-extrabold text-[--color-text]">
                      {originalEndDate ? formatDateIST(originalEndDate) : "—"}
                    </p>
                  </div>

                  <div className="h-px bg-[--color-border]" />

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[--color-muted]">
                      New end date
                    </p>
                    <p className="text-sm font-semibold text-[--color-text]">
                      Must be earlier or same
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[--color-error]/30 bg-[--color-error]/10 p-4">
                  <p className="text-sm font-semibold text-[--color-error]">
                    You cannot extend the task beyond its original end date.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-[--color-border] flex justify-end gap-2">
                <button
                  onClick={() => setShowEndEarlyNotice(false)}
                  className="px-4 py-2 rounded-xl border border-[--color-border] bg-[--color-surface] text-[--color-text] font-semibold hover:bg-[--color-background] transition"
                >
                  Close
                </button>

                <button
                  onClick={() => setShowEndEarlyNotice(false)}
                  className="px-4 py-2 rounded-xl bg-[--color-primary] text-white font-semibold hover:opacity-90 transition"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}



        {/* ✅ Reason Modal */}
        {showReasonModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setShowReasonModal(false);
                setEndedEarlyReason("");
                setPendingEndDate("");
              }}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md rounded-2xl border border-[--color-border] bg-[--color-surface] shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="p-5 border-b border-[--color-border] flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[--color-error]/15 text-[--color-error] text-lg">
                    ⏱️
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[--color-text]">
                      End Recurring Task Early
                    </h3>
                    <p className="text-xs text-[--color-muted] mt-0.5">
                      Provide a reason before confirming this action.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowReasonModal(false);
                    setEndedEarlyReason("");
                    setPendingEndDate("");
                  }}
                  className="h-9 w-9 rounded-full border border-[--color-border] flex items-center justify-center hover:bg-[--color-background] transition text-[--color-text]"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-[--color-muted] mb-1">
                    New End Date
                  </label>

                  <input
                    value={formatDateISTShort(pendingEndDate)}
                    readOnly
                    className="w-full px-3 py-2 rounded-xl border border-[--color-border] bg-[--color-background] font-semibold text-[--color-text] focus:outline-none"
                  />
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-semibold text-[--color-muted] mb-1">
                    Reason <span className="text-[--color-error]">*</span>
                  </label>

                  <textarea
                    value={endedEarlyReason}
                    onChange={(e) => setEndedEarlyReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-[--color-border] bg-[--color-surface] text-[--color-text] placeholder:text-[--color-muted] focus:outline-none focus:ring-1 focus:ring-[--color-primary]"
                  // placeholder="Example: Work completed early, remaining days not required"
                  />
                </div>

                {/* Small Warning */}
                <div className="rounded-2xl border border-[--color-error]/30 bg-[--color-error]/10 p-4">
                  <p className="text-xs font-semibold text-[--color-error]">
                    This will stop generating future tasks after the new end date.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-[--color-border] flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowReasonModal(false);
                    setEndedEarlyReason("");
                    setPendingEndDate("");
                  }}
                  className="px-4 py-2 rounded-xl border border-[--color-border] bg-[--color-surface] text-[--color-text] font-semibold hover:bg-[--color-background] transition"
                >
                  Cancel
                </button>

                <button
                  onClick={() => {
                    if (!endedEarlyReason.trim()) {
                      toast.info("Reason is required");
                      return;
                    }

                    setEditFormData((prev) => ({
                      ...prev,
                      endDate: pendingEndDate,
                      endedEarlyReason: endedEarlyReason.trim()
                    }));

                    setShowReasonModal(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-[--color-primary] text-white font-semibold hover:opacity-90 transition"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}


      </div>
    );
  }
);

EditMasterTaskModal.displayName = "EditMasterTaskModal";
export default EditMasterTaskModal;
