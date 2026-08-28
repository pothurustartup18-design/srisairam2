import { SequenceCounter } from '../models/sequenceCounter.model';

export const getNextAdmissionNumber = async (admissionYear: number): Promise<string> => {
  const counter = await SequenceCounter.findOneAndUpdate(
    { name: `admission:${admissionYear}` },
    { $inc: { sequenceValue: 1 } },
    { new: true, upsert: true }
  );
  const padded = String(counter.sequenceValue).padStart(4, '0');
  return `${admissionYear}-${padded}`;
};

export const previewNextAdmissionNumber = async (admissionYear: number): Promise<string> => {
  const counter = await SequenceCounter.findOne({ name: `admission:${admissionYear}` });
  const nextValue = counter ? counter.sequenceValue + 1 : 1;
  const padded = String(nextValue).padStart(4, '0');
  return `${admissionYear}-${padded}`;
};

export const getNextEmployeeId = async (): Promise<string> => {
  const counter = await SequenceCounter.findOneAndUpdate(
    { name: 'employee' },
    { $inc: { sequenceValue: 1 } },
    { new: true, upsert: true }
  );
  const padded = String(counter.sequenceValue).padStart(3, '0');
  return `EMP-${padded}`;
};
