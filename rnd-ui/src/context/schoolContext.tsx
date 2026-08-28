import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE } from '../constants';
import { getAccessToken } from '../services/api';

export interface SchoolProfileData {
  schoolInfo: {
    schoolName: string;
    schoolCode: string;
    logo?: string;
  };
  contactInfo: {
    email: string;
    phone: string;
    website?: string;
  };
  address: {
    addressLine: string;
    city: string;
    state: string;
    pincode: string;
  };
  academicConfig: {
    currentAcademicYear: string;
    startTime: string;
    endTime: string;
  };
  communicationSettings: {
    whatsappEnabled: boolean;
    emailEnabled: boolean;
  };
}

const defaultProfile: SchoolProfileData = {
  schoolInfo: {
    schoolName: 'RND School',
    schoolCode: 'SCH-001',
    logo: ''
  },
  contactInfo: {
    email: 'admin@schoolhub.edu',
    phone: '+91 9392646349',
    website: 'https://schoolhub.edu'
  },
  address: {
    addressLine: '123 Education Campus Road',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500001'
  },
  academicConfig: {
    currentAcademicYear: '2026-27',
    startTime: '08:30',
    endTime: '15:30'
  },
  communicationSettings: {
    whatsappEnabled: true,
    emailEnabled: true
  }
};

interface SchoolContextType {
  schoolProfile: SchoolProfileData;
  updateSchoolProfile: (updates: Partial<SchoolProfileData>) => Promise<boolean>;
  updateAdminProfile: (adminData: any) => Promise<{ success: boolean; message: string }>;
  loading: boolean;
  reloadSchoolProfile: () => Promise<void>;
}

const SchoolContext = createContext<SchoolContextType>({
  schoolProfile: defaultProfile,
  updateSchoolProfile: async () => false,
  updateAdminProfile: async () => ({ success: false, message: '' }),
  loading: true,
  reloadSchoolProfile: async () => {},
});

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfileData>(() => {
    try {
      const saved = localStorage.getItem('schoolhub_school_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultProfile,
          ...parsed,
          schoolInfo: { ...defaultProfile.schoolInfo, ...parsed.schoolInfo },
          contactInfo: { ...defaultProfile.contactInfo, ...parsed.contactInfo },
          address: { ...defaultProfile.address, ...parsed.address },
          academicConfig: { ...defaultProfile.academicConfig, ...parsed.academicConfig },
          communicationSettings: { ...defaultProfile.communicationSettings, ...parsed.communicationSettings }
        };
      }
    } catch {}
    return defaultProfile;
  });

  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/school-profile?_t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const merged: SchoolProfileData = {
            ...defaultProfile,
            ...json.data,
            schoolInfo: { ...defaultProfile.schoolInfo, ...json.data.schoolInfo },
            contactInfo: { ...defaultProfile.contactInfo, ...json.data.contactInfo },
            address: { ...defaultProfile.address, ...json.data.address },
            academicConfig: { ...defaultProfile.academicConfig, ...json.data.academicConfig },
            communicationSettings: { ...defaultProfile.communicationSettings, ...json.data.communicationSettings }
          };
          setSchoolProfile(merged);
          localStorage.setItem('schoolhub_school_profile', JSON.stringify(merged));
        }
      }
    } catch {
      // Use default fallback profile
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const updateSchoolProfile = async (updates: Partial<SchoolProfileData>): Promise<boolean> => {
    try {
      // 1. Instantly update local state and localStorage for instant responsive UI
      const newProfile: SchoolProfileData = {
        ...schoolProfile,
        ...updates,
        schoolInfo: { ...schoolProfile.schoolInfo, ...updates.schoolInfo },
        contactInfo: { ...schoolProfile.contactInfo, ...updates.contactInfo },
        address: { ...schoolProfile.address, ...updates.address },
        academicConfig: { ...schoolProfile.academicConfig, ...updates.academicConfig },
        communicationSettings: { ...schoolProfile.communicationSettings, ...updates.communicationSettings }
      };

      setSchoolProfile(newProfile);
      localStorage.setItem('schoolhub_school_profile', JSON.stringify(newProfile));

      // 2. Persist to MongoDB via API
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/school-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(newProfile)
      });

      const json = await res.json();
      if (json.success && json.data) {
        const synced: SchoolProfileData = {
          ...defaultProfile,
          ...json.data,
          schoolInfo: { ...defaultProfile.schoolInfo, ...json.data.schoolInfo },
          contactInfo: { ...defaultProfile.contactInfo, ...json.data.contactInfo },
          address: { ...defaultProfile.address, ...json.data.address },
          academicConfig: { ...defaultProfile.academicConfig, ...json.data.academicConfig },
          communicationSettings: { ...defaultProfile.communicationSettings, ...json.data.communicationSettings }
        };
        setSchoolProfile(synced);
        localStorage.setItem('schoolhub_school_profile', JSON.stringify(synced));
        return true;
      }
      return true; // Local state & localStorage updated successfully
    } catch {
      return true;
    }
  };

  const updateAdminProfile = async (adminData: any): Promise<{ success: boolean; message: string }> => {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/school-profile/admin-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(adminData)
      });
      const json = await res.json();
      return { success: json.success, message: json.message || (json.success ? 'Admin profile updated' : 'Failed to update') };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error updating admin profile' };
    }
  };

  return (
    <SchoolContext.Provider
      value={{
        schoolProfile,
        updateSchoolProfile,
        updateAdminProfile,
        loading,
        reloadSchoolProfile: fetchProfile
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => useContext(SchoolContext);
