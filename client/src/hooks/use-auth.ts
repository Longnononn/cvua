import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type UserInput } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { API_BASE_URL } from "@/lib/queryClient";

const TOKEN_KEY = "auth_token";

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery({
    queryKey: [api.users.me.path],
    queryFn: async () => {
      const token = getToken();
      if (!token) return null;
      const res = await fetch(API_BASE_URL + api.users.me.path, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearToken();
        return null;
      }
      if (!res.ok) throw new Error("Không thể lấy thông tin người dùng");
      return api.users.me.responses[200].parse(await res.json());
    },
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: UserInput) => {
      const res = await fetch(API_BASE_URL + api.users.login.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Sai tên đăng nhập hoặc mật khẩu");
        }
        const error = await res.json();
        throw new Error(error.message || "Đăng nhập thất bại");
      }
      return api.users.login.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      const token = (data as any)?.token;
      if (typeof token === "string" && token) {
        setToken(token);
      }
      queryClient.setQueryData([api.users.me.path], data);
      toast({
        title: "Chào mừng quay lại!",
        description: `Đăng nhập với tài khoản ${data.username}`,
        variant: "default",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Đăng nhập thất bại",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: UserInput) => {
      const res = await fetch(API_BASE_URL + api.users.register.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Đăng ký thất bại");
      }
      return api.users.register.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      const token = (data as any)?.token;
      if (typeof token === "string" && token) {
        setToken(token);
      }
      queryClient.setQueryData([api.users.me.path], data);
      toast({
        title: "Tạo tài khoản thành công!",
        description: `Chào mừng đến với ChessPro, ${data.username}!`,
        variant: "default",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Đăng ký thất bại",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const token = getToken();
      const res = await fetch(API_BASE_URL + "/api/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error("Đăng xuất thất bại");
      }
      clearToken();
      queryClient.setQueryData([api.users.me.path], null);
    },
    onSuccess: () => {
      setLocation("/auth");
      toast({
        title: "Đã đăng xuất",
        description: "Bạn cần đăng nhập lại để tiếp tục chơi.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Đăng xuất thất bại",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutate,
  };
}
