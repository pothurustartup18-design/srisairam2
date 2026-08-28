import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE } from '../constants';
import { getAccessToken } from '../services/api';
import { useAuth } from './authContext';
import { useSchool } from './schoolContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { reloadSchoolProfile } = useSchool();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    // Derive WebSocket URL from API_BASE (e.g. http://localhost:5002)
    const socketUrl = API_BASE.replace('/api', '');
    const newSocket = io(socketUrl, {
      query: { token },
      auth: { token },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('[Socket] Connected to server.');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Socket] Disconnected from server.');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!socket) return;

    socket.on('school_profile_updated', () => {
      console.log('[Socket] School profile updated, reloading settings...');
      reloadSchoolProfile();
    });

    return () => {
      socket.off('school_profile_updated');
    };
  }, [socket, reloadSchoolProfile]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
