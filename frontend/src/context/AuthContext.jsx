import React, { createContext, useState, useEffect } from 'react';
import api from '../api';

export const AuthContext = createContext();

// Check if a JWT token is expired by reading its `exp` claim
const isTokenExpired = (token) => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (!payload.exp) return false; // No expiry claim → treat as valid
        return Date.now() >= payload.exp * 1000; // exp is in seconds
    } catch {
        return true; // Can't decode → treat as expired
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    // Track whether the backend server is confirmed reachable.
    // Starts as false when a stored token exists (returning user), true otherwise.
    const [serverAwake, setServerAwake] = useState(!localStorage.getItem('token'));

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            // Auto-logout if the token has expired (e.g. user returns after a long time)
            if (isTokenExpired(storedToken)) {
                localStorage.removeItem('token');
                setToken(null);
                setServerAwake(true); // No need to wake server for a logged-out user
                setIsLoading(false);
                return;
            }

            setToken(storedToken);
            setIsAuthenticated(true);
            try {
                // Simple B64 decode of JWT payload (2nd part)
                const payload = JSON.parse(atob(storedToken.split('.')[1]));
                if (payload.sub) {
                    setUser({ username: payload.sub });
                }
            } catch (e) {
                console.error("Failed to decode token", e);
            }
        }
        setIsLoading(false);
    }, []);


    const login = async (username, password) => {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        try {
            const response = await api.post('/token', formData);
            const { access_token } = response.data;

            localStorage.setItem('token', access_token);
            setToken(access_token);
            setIsAuthenticated(true);
            setServerAwake(true); // Server responded → it's awake
            setUser({ username }); // We could decode token for more info
            return { success: true };
        } catch (error) {
            console.error("Login failed", error);
            // When error.response is missing, it means the server never replied (network error)
            const isNetworkError = !error.response;
            return {
                success: false,
                isNetworkError,
                message: error.response?.data?.detail || "Login failed"
            };
        }
    };

    const register = async (username, email, password) => {
        try {
            await api.post('/register', { username, email, password });
            return { success: true };
        } catch (error) {
            console.error("Registration failed", error);
            let errorMessage = "Registration failed";
            if (error.response?.data?.detail) {
                const detail = error.response.data.detail;
                if (typeof detail === 'string') {
                    errorMessage = detail;
                } else if (Array.isArray(detail)) {
                    errorMessage = detail.map(err => err.msg).join(', ');
                } else if (typeof detail === 'object') {
                    errorMessage = JSON.stringify(detail);
                }
            }
            return { success: false, message: errorMessage };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
        setServerAwake(true); // Reset so login page doesn't show wake-up
    };

    const forgotPassword = async (email) => {
        try {
            const response = await api.post('/forgot-password', { email });
            return { success: true, message: response.data.message };
        } catch (error) {
            console.error("Forgot password request failed", error);
            return {
                success: false,
                message: error.response?.data?.detail || "Failed to process request"
            };
        }
    };

    const resetPassword = async (token, newPassword) => {
        try {
            const response = await api.post('/reset-password', {
                token,
                new_password: newPassword
            });
            return { success: true, message: response.data.message };
        } catch (error) {
            console.error("Password reset failed", error);
            let errorMessage = "Password reset failed";
            if (error.response?.data?.detail) {
                const detail = error.response.data.detail;
                if (typeof detail === 'string') {
                    errorMessage = detail;
                } else if (Array.isArray(detail)) {
                    errorMessage = detail.map(err => err.msg).join(', ');
                }
            }
            return { success: false, message: errorMessage };
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated,
            isLoading,
            serverAwake,
            setServerAwake,
            login,
            register,
            logout,
            forgotPassword,
            resetPassword
        }}>
            {children}
        </AuthContext.Provider>
    );
};
