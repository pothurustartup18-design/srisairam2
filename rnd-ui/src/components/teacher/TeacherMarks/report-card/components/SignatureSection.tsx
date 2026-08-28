import React from 'react';
import { SignatureRenderer } from '../../../../shared/SignatureRenderer/SignatureRenderer';

interface SignatureSectionProps {
  classTeacherName: string;
  teacherSignatureDataUri: string | null;
  principalName: string;
  principalSignatureDataUri: string | null;
  parentName?: string | null;
}

export const SignatureSection: React.FC<SignatureSectionProps> = ({
  classTeacherName,
  teacherSignatureDataUri,
  principalName,
  principalSignatureDataUri,
  parentName = null,
}) => {
  return (
    <div className="page2-signatures-section">
      <SignatureRenderer
        signatureUrl={teacherSignatureDataUri}
        name={classTeacherName}
        designation="Class Teacher"
        maxHeight={40}
        maxWidth={130}
      />
      <SignatureRenderer
        signatureUrl={principalSignatureDataUri}
        name={principalName}
        designation="Principal"
        maxHeight={40}
        maxWidth={130}
      />
      <SignatureRenderer
        signatureUrl={null}
        name={parentName}
        designation="Parent / Guardian"
        maxHeight={40}
        maxWidth={130}
      />
    </div>
  );
};
export default SignatureSection;
