import Company from '../models/Company.js';
import Task from '../models/Task.js';

export const formatTaskId = (companyId, seq) => {
  const safeSeq = Number(seq) || 0;
  return String(safeSeq);
};

const syncCompanySequence = async (companyId) => {
  const [company, maxTask] = await Promise.all([
    Company.findOne({ companyId }).select('taskSequence').lean(),
    Task.findOne({ companyId, taskSeq: { $exists: true, $ne: null } })
      .sort({ taskSeq: -1 })
      .select('taskSeq')
      .lean()
  ]);

  if (!company) {
    throw new Error('Company not found');
  }

  const maxSeq = maxTask?.taskSeq || 0;
  const currentSeq = company.taskSequence || 0;

  if (maxSeq > currentSeq) {
    await Company.updateOne({ companyId }, { $set: { taskSequence: maxSeq } });
    return maxSeq;
  }

  return currentSeq;
};

export const reserveTaskSequences = async (companyId, count) => {
  if (!companyId) {
    throw new Error('companyId is required');
  }

  if (!count || count <= 0) {
    return null;
  }

  await syncCompanySequence(companyId);

  const updatedCompany = await Company.findOneAndUpdate(
    { companyId },
    { $inc: { taskSequence: count } },
    { new: true }
  ).lean();

  if (!updatedCompany) {
    throw new Error('Company not found');
  }

  const end = updatedCompany.taskSequence || 0;
  const start = end - count + 1;
  return { start, end };
};
