import React, { createContext, useState, useEffect } from 'react';
import api from '../api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
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
            setUser({ username }); // We could decode token for more info
            return { success: true };
        } catch (error) {
            console.error("Login failed", error);
            return { success: false, message: error.response?.data?.detail || "Login failed" };
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
