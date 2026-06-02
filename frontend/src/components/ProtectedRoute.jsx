import React, { useContext, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ServerWakeUp from './ui/ServerWakeUp';

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, isLoading, serverAwake, setServerAwake } = useContext(AuthContext);

    const handleServerReady = useCallback(() => {
        setServerAwake(true);
    }, [setServerAwake]);

    if (isLoading) {
        return <div className="min-h-screen text-white flex items-center justify-center">Loading...</div>;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // User is authenticated but server might be sleeping (returning user with stored token)
    if (!serverAwake) {
        return <ServerWakeUp isVisible={true} onServerReady={handleServerReady} />;
    }

    return children;
};

export default ProtectedRoute;

