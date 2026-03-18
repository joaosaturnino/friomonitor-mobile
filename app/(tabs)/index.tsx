import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// 🔴 ATENÇÃO: Troque pelo IP do seu computador na rede Wi-Fi!
// Exemplo: http://192.168.1.15:3001/api
const API_URL = "http://192.168.137.235:3001/api";

const TIPOS_EQUIP = [
  "Camara Fria Resfriada",
  "Camara Fria Congelados",
  "Balcão de Atendimento Padaria",
  "Balcão de Atendimento Frios",
  "Balcão Auto-Atendimento Frios",
  "Balcão Auto-Atendimento Fatiados",
  "Balcão Laticinio",
  "Balcão Frutas",
  "Balcão Verduras",
  "Boleira",
  "Balcão Auto-Atendimento Rotisseria",
  "Balcão Margarina",
  "Ilha Congelados Direita",
  "Ilha Congelados Esquerda",
  "Ilha Congelados Superior",
  "Ilha Congelados Inferior",
  "Cooler",
];
const SETORES = ["Açougue", "Padaria", "Rotisseria", "Frios", "Cooler", "FLV"];

export default function App() {
  const [token, setToken] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [abaAtiva, setAbaAtiva] = useState("dashboard");
  const [equipamentos, setEquipamentos] = useState([]);
  const [notificacoes, setNotificacoes] = useState([]);
  const [historico, setHistorico] = useState([]);

  const [setorFiltro, setSetorFiltro] = useState("");

  // Estados de UI
  const [toast, setToast] = useState({
    visivel: false,
    msg: "",
    tipo: "success",
  });
  const toastAnim = useRef(new Animated.Value(-100)).current;

  const [modalResolucao, setModalResolucao] = useState({
    visivel: false,
    idAlerta: null,
    nota: "",
  });
  const [modalConfirmacao, setModalConfirmacao] = useState({
    visivel: false,
    titulo: "",
    msg: "",
    onConfirm: null,
  });
  const [modalForm, setModalForm] = useState({ visivel: false, isEdit: false });
  const [modalSelect, setModalSelect] = useState({
    visivel: false,
    titulo: "",
    opcoes: [],
    onSelect: null,
  });

  const [formEquip, setFormEquip] = useState({
    id: null,
    nome: "",
    tipo: "",
    temp_min: "",
    temp_max: "",
    intervalo_degelo: "",
    duracao_degelo: "",
    setor: "",
  });

  // Temas dinâmicos
  const TEMA = {
    bg: isDarkMode ? "#0f172a" : "#f3f4f6",
    card: isDarkMode ? "#1e293b" : "#ffffff",
    text: isDarkMode ? "#f8fafc" : "#111827",
    muted: isDarkMode ? "#94a3b8" : "#6b7280",
    border: isDarkMode ? "#334155" : "#e5e7eb",
    primary: "#006837",
    secondary: "#8CC63F",
    danger: "#ef4444",
    dangerLight: isDarkMode ? "#450a0a" : "#fee2e2",
    info: "#38bdf8",
    warning: "#f59e0b",
  };

  useEffect(() => {
    verificarLogin();
  }, []);

  useEffect(() => {
    if (token) {
      carregarDados();
      const interval = setInterval(carregarDados, 5000);
      return () => clearInterval(interval);
    }
  }, [token, abaAtiva]);

  const verificarLogin = async () => {
    const tokenSalvo = await AsyncStorage.getItem("tokenFrioMonitorMobile");
    const temaSalvo = await AsyncStorage.getItem("temaMobile");
    if (temaSalvo === "dark") setIsDarkMode(true);
    if (tokenSalvo) setToken(tokenSalvo);
    setLoading(false);
  };

  const alternarTema = async () => {
    const novoTema = !isDarkMode;
    setIsDarkMode(novoTema);
    await AsyncStorage.setItem("temaMobile", novoTema ? "dark" : "light");
  };

  const mostrarToast = (msg, tipo = "success") => {
    setToast({ visivel: true, msg, tipo });
    Animated.timing(toastAnim, {
      toValue: 50,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setToast({ visivel: false, msg: "", tipo: "success" }));
    }, 3000);
  };

  const api = axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const fazerLogin = async () => {
    try {
      const res = await axios.post(`${API_URL}/login`, { usuario, senha });
      setToken(res.data.token);
      await AsyncStorage.setItem("tokenFrioMonitorMobile", res.data.token);
      mostrarToast("Acesso Autorizado", "success");
    } catch (error) {
      mostrarToast("Credenciais incorretas ou falha de rede.", "error");
    }
  };

  const fazerLogout = async () => {
    setToken("");
    await AsyncStorage.removeItem("tokenFrioMonitorMobile");
  };

  const carregarDados = async () => {
    try {
      const [resEquip, resNotif, resHist] = await Promise.all([
        api.get("/equipamentos"),
        api.get("/notificacoes"),
        abaAtiva === "historico"
          ? api.get("/notificacoes/historico")
          : Promise.resolve({ data: historico }),
      ]);
      setEquipamentos(resEquip.data);
      setNotificacoes(resNotif.data);
      if (abaAtiva === "historico") setHistorico(resHist.data);
    } catch (error) {
      if (error.response?.status === 401) fazerLogout();
    }
  };

  const resolverNotificacao = async () => {
    const notaFinal =
      modalResolucao.nota.trim() === ""
        ? "Resolvido sem observações"
        : modalResolucao.nota;
    try {
      await api.put(`/notificacoes/${modalResolucao.idAlerta}/resolver`, {
        nota_resolucao: notaFinal,
      });
      setModalResolucao({ visivel: false, idAlerta: null, nota: "" });
      carregarDados();
      mostrarToast("Intervenção registada com sucesso!", "success");
    } catch (error) {
      mostrarToast("Erro ao resolver alerta.", "error");
    }
  };

  const resolverTodasNotificacoes = async () => {
    try {
      await api.put(`/notificacoes/resolver-todas`);
      carregarDados();
      mostrarToast("Todos os alertas foram limpos.", "success");
    } catch (error) {
      mostrarToast("Erro ao limpar alertas.", "error");
    }
  };

  const salvarEquipamento = async () => {
    if (!formEquip.nome || !formEquip.tipo || !formEquip.setor) {
      return mostrarToast("Preencha os campos obrigatórios!", "error");
    }
    try {
      if (modalForm.isEdit) {
        await api.put(`/equipamentos/${formEquip.id}/edit`, formEquip);
        mostrarToast("Equipamento atualizado!", "success");
      } else {
        await api.post("/equipamentos", formEquip);
        mostrarToast("Equipamento registado!", "success");
      }
      setModalForm({ visivel: false, isEdit: false });
      carregarDados();
    } catch (error) {
      mostrarToast("Erro ao guardar equipamento.", "error");
    }
  };

  const excluirEquipamento = async (id) => {
    try {
      await api.delete(`/equipamentos/${id}`);
      carregarDados();
      mostrarToast("Equipamento removido.", "success");
    } catch (error) {
      mostrarToast("Erro ao remover.", "error");
    }
  };

  const abrirFormulario = (eq = null) => {
    if (eq) {
      setFormEquip({
        id: eq.id,
        nome: eq.nome,
        tipo: eq.tipo,
        temp_min: eq.temp_min.toString(),
        temp_max: eq.temp_max.toString(),
        intervalo_degelo: eq.intervalo_degelo.toString(),
        duracao_degelo: eq.duracao_degelo.toString(),
        setor: eq.setor,
      });
      setModalForm({ visivel: true, isEdit: true });
    } else {
      setFormEquip({
        id: null,
        nome: "",
        tipo: "",
        temp_min: "",
        temp_max: "",
        intervalo_degelo: "",
        duracao_degelo: "",
        setor: "",
      });
      setModalForm({ visivel: true, isEdit: false });
    }
  };

  if (loading)
    return (
      <View style={[styles.center, { backgroundColor: TEMA.bg }]}>
        <ActivityIndicator size="large" color={TEMA.primary} />
      </View>
    );

  if (!token) {
    return (
      <View style={[styles.loginContainer, { backgroundColor: TEMA.primary }]}>
        <View style={[styles.loginBox, { backgroundColor: TEMA.card }]}>
          <Ionicons
            name="snow"
            size={60}
            color={TEMA.primary}
            style={{ textAlign: "center", marginBottom: 10 }}
          />
          <Text style={[styles.loginTitle, { color: TEMA.primary }]}>
            FrioMonitor
          </Text>
          <Text style={[styles.loginSubtitle, { color: TEMA.muted }]}>
            Portal Mobile Empresarial
          </Text>

          <Text style={[styles.label, { color: TEMA.text }]}>Utilizador</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: TEMA.bg,
                color: TEMA.text,
                borderColor: TEMA.border,
              },
            ]}
            placeholder="admin"
            placeholderTextColor={TEMA.muted}
            value={usuario}
            onChangeText={setUsuario}
            autoCapitalize="none"
          />

          <Text style={[styles.label, { color: TEMA.text }]}>
            Palavra-passe
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: TEMA.bg,
                color: TEMA.text,
                borderColor: TEMA.border,
              },
            ]}
            placeholder="••••••••"
            placeholderTextColor={TEMA.muted}
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: TEMA.primary }]}
            onPress={fazerLogin}
          >
            <Text style={styles.btnText}>Entrar no Sistema</Text>
          </TouchableOpacity>
        </View>

        <Animated.View
          style={[
            styles.toast,
            {
              transform: [{ translateY: toastAnim }],
              backgroundColor:
                toast.tipo === "success" ? TEMA.success : TEMA.danger,
            },
          ]}
        >
          <Ionicons
            name={toast.tipo === "success" ? "checkmark-circle" : "warning"}
            size={24}
            color="white"
          />
          <Text style={styles.toastText}>{toast.msg}</Text>
        </Animated.View>
      </View>
    );
  }

  const qtdTotal = equipamentos.length;
  const qtdDegelo = equipamentos.filter((e) => e.em_degelo).length;
  const qtdFalha = equipamentos.filter(
    (e) => !e.motor_ligado && !e.em_degelo,
  ).length;
  const qtdOperando = qtdTotal - qtdDegelo - qtdFalha;

  const eqFiltrados = setorFiltro
    ? equipamentos.filter((e) => e.setor === setorFiltro)
    : equipamentos;

  return (
    <View style={[styles.appContainer, { backgroundColor: TEMA.bg }]}>
      {/* HEADER */}
      <View
        style={[
          styles.header,
          { backgroundColor: TEMA.card, borderBottomColor: TEMA.border },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons
            name="snow"
            size={24}
            color={TEMA.primary}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.headerTitle, { color: TEMA.text }]}>
            FrioMonitor
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 15 }}>
          <TouchableOpacity onPress={alternarTema}>
            <Ionicons
              name={isDarkMode ? "sunny" : "moon"}
              size={24}
              color={TEMA.muted}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={fazerLogout}>
            <Ionicons name="log-out-outline" size={24} color={TEMA.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* TOAST GLOBAL */}
      <Animated.View
        style={[
          styles.toast,
          {
            transform: [{ translateY: toastAnim }],
            backgroundColor:
              toast.tipo === "success" ? TEMA.success : TEMA.danger,
          },
        ]}
      >
        <Ionicons
          name={toast.tipo === "success" ? "checkmark-circle" : "warning"}
          size={24}
          color="white"
        />
        <Text style={styles.toastText}>{toast.msg}</Text>
      </Animated.View>

      {/* CONTEÚDO SCROLLABLE */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* ABA 1: DASHBOARD */}
        {abaAtiva === "dashboard" && (
          <View>
            <View style={styles.summaryGrid}>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: TEMA.card, borderColor: TEMA.border },
                ]}
              >
                <Text style={[styles.summaryLabel, { color: TEMA.muted }]}>
                  Parque Total
                </Text>
                <Text style={[styles.summaryValue, { color: TEMA.text }]}>
                  {qtdTotal}
                </Text>
              </View>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: TEMA.card, borderColor: TEMA.border },
                ]}
              >
                <Text style={[styles.summaryLabel, { color: TEMA.muted }]}>
                  A Operar
                </Text>
                <Text style={[styles.summaryValue, { color: TEMA.success }]}>
                  {qtdOperando}
                </Text>
              </View>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: TEMA.card, borderColor: TEMA.border },
                ]}
              >
                <Text style={[styles.summaryLabel, { color: TEMA.muted }]}>
                  Em Degelo
                </Text>
                <Text style={[styles.summaryValue, { color: TEMA.info }]}>
                  {qtdDegelo}
                </Text>
              </View>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: TEMA.card, borderColor: TEMA.border },
                ]}
              >
                <Text style={[styles.summaryLabel, { color: TEMA.muted }]}>
                  Falhas Ativas
                </Text>
                <Text style={[styles.summaryValue, { color: TEMA.danger }]}>
                  {qtdFalha}
                </Text>
              </View>
            </View>

            <View style={styles.flexHeader}>
              <Text style={[styles.sectionTitle, { color: TEMA.text }]}>
                Alertas Críticos
              </Text>
              {notificacoes.length > 0 && (
                <TouchableOpacity
                  onPress={() =>
                    setModalConfirmacao({
                      visivel: true,
                      titulo: "Limpar Alarmes",
                      msg: "Deseja marcar todos como resolvidos?",
                      onConfirm: resolverTodasNotificacoes,
                    })
                  }
                >
                  <Text style={{ color: TEMA.danger, fontWeight: "bold" }}>
                    Limpar Todos
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {notificacoes.length === 0 ? (
              <View
                style={[
                  styles.emptyState,
                  { backgroundColor: TEMA.card, borderColor: TEMA.border },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={60}
                  color={TEMA.success}
                />
                <Text style={[styles.emptyStateText, { color: TEMA.text }]}>
                  Sistema Estabilizado
                </Text>
              </View>
            ) : (
              notificacoes.map((notif) => (
                <View
                  key={notif.id}
                  style={[
                    styles.alertCard,
                    {
                      backgroundColor: TEMA.dangerLight,
                      borderLeftColor: TEMA.danger,
                    },
                  ]}
                >
                  <View style={styles.alertTop}>
                    <Ionicons name="warning" size={24} color={TEMA.danger} />
                    <Text style={[styles.alertEquip, { color: TEMA.danger }]}>
                      {notif.equipamento_nome}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.badgeSetor,
                      {
                        backgroundColor: isDarkMode ? "#7f1d1d" : "#fca5a5",
                        color: isDarkMode ? "#fecaca" : "#7f1d1d",
                      },
                    ]}
                  >
                    {notif.setor}
                  </Text>
                  <Text
                    style={[
                      styles.alertMsg,
                      { color: isDarkMode ? "#fecaca" : "#7f1d1d" },
                    ]}
                  >
                    {notif.mensagem}
                  </Text>
                  <Text
                    style={{
                      color: TEMA.danger,
                      fontSize: 12,
                      marginBottom: 10,
                    }}
                  >
                    {new Date(notif.data_hora).toLocaleString()}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.btnPrimary,
                      { backgroundColor: TEMA.danger },
                    ]}
                    onPress={() =>
                      setModalResolucao({
                        visivel: true,
                        idAlerta: notif.id,
                        nota: "",
                      })
                    }
                  >
                    <Text style={styles.btnText}>Assumir Intervenção</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* ABA 2: MOTORES */}
        {abaAtiva === "motores" && (
          <View>
            <View style={styles.flexHeader}>
              <Text style={[styles.sectionTitle, { color: TEMA.text }]}>
                Telemetria IoT
              </Text>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() =>
                  setModalSelect({
                    visivel: true,
                    titulo: "Filtrar por Setor",
                    opcoes: [
                      { label: "Todos os Setores", value: "" },
                      ...SETORES.map((s) => ({ label: s, value: s })),
                    ],
                    onSelect: setSetorFiltro,
                  })
                }
              >
                <Ionicons name="filter" size={16} color={TEMA.text} />
                <Text style={{ color: TEMA.text, fontWeight: "bold" }}>
                  {setorFiltro || "Todos"}
                </Text>
              </TouchableOpacity>
            </View>

            {eqFiltrados.map((eq) => {
              const isTempAlta = eq.ultima_temp > eq.temp_max && !eq.em_degelo;
              return (
                <View
                  key={eq.id}
                  style={[
                    styles.motorCard,
                    {
                      backgroundColor: TEMA.card,
                      borderColor: TEMA.border,
                      borderLeftColor: eq.em_degelo
                        ? TEMA.info
                        : eq.motor_ligado
                          ? TEMA.success
                          : TEMA.danger,
                    },
                  ]}
                >
                  <View style={styles.motorHeader}>
                    <Text style={[styles.motorTitle, { color: TEMA.text }]}>
                      {eq.nome}
                    </Text>
                    <Text
                      style={[
                        styles.badgeSetor,
                        { backgroundColor: TEMA.bg, color: TEMA.text },
                      ]}
                    >
                      {eq.setor}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBox,
                      {
                        backgroundColor: eq.em_degelo
                          ? TEMA.info
                          : eq.motor_ligado
                            ? TEMA.primary
                            : TEMA.danger,
                      },
                    ]}
                  >
                    <View style={styles.statusInfo}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Ionicons name="power" size={20} color="white" />
                        <Text style={styles.statusText}>
                          {eq.em_degelo
                            ? "DEGELO"
                            : eq.motor_ligado
                              ? "EM OPERAÇÃO"
                              : "PARADO"}
                        </Text>
                      </View>
                      <Text style={styles.statusLimits}>
                        Mín: {eq.temp_min}°C | Máx: {eq.temp_max}°C
                      </Text>
                    </View>
                    <View style={styles.tempDisplay}>
                      <Text style={styles.tempDisplayLabel}>Atual</Text>
                      <Text
                        style={[
                          styles.tempDisplayValue,
                          { color: isTempAlta ? "#ffcccc" : "white" },
                        ]}
                      >
                        {eq.ultima_temp ? `${eq.ultima_temp}°C` : "--"}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
            {eqFiltrados.length === 0 && (
              <Text
                style={{
                  color: TEMA.muted,
                  textAlign: "center",
                  marginTop: 20,
                }}
              >
                Nenhum equipamento neste setor.
              </Text>
            )}
          </View>
        )}

        {/* ABA 3: EQUIPAMENTOS (CRUD) */}
        {abaAtiva === "equipamentos" && (
          <View>
            <View style={styles.flexHeader}>
              <Text style={[styles.sectionTitle, { color: TEMA.text }]}>
                Inventário
              </Text>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor: TEMA.primary,
                    paddingHorizontal: 15,
                    paddingVertical: 8,
                  },
                ]}
                onPress={() => abrirFormulario()}
              >
                <Text style={styles.btnText}>+ Novo</Text>
              </TouchableOpacity>
            </View>

            {equipamentos.map((eq) => (
              <View
                key={eq.id}
                style={[
                  styles.listCard,
                  { backgroundColor: TEMA.card, borderColor: TEMA.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listTitle, { color: TEMA.text }]}>
                    {eq.nome}
                  </Text>
                  <Text style={[styles.listSub, { color: TEMA.muted }]}>
                    {eq.tipo}
                  </Text>
                  <Text
                    style={[
                      styles.badgeSetor,
                      {
                        backgroundColor: TEMA.bg,
                        color: TEMA.text,
                        marginTop: 5,
                      },
                    ]}
                  >
                    {eq.setor}
                  </Text>
                </View>
                <View style={styles.listActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => abrirFormulario(eq)}
                  >
                    <Ionicons name="pencil" size={20} color={TEMA.warning} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() =>
                      setModalConfirmacao({
                        visivel: true,
                        titulo: "Confirmar Exclusão",
                        msg: `Deseja eliminar "${eq.nome}"?`,
                        onConfirm: () => excluirEquipamento(eq.id),
                      })
                    }
                  >
                    <Ionicons name="trash" size={20} color={TEMA.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ABA 4: HISTÓRICO (AUDITORIA) */}
        {abaAtiva === "historico" && (
          <View>
            <Text style={[styles.sectionTitle, { color: TEMA.text }]}>
              Diário de Intervenções
            </Text>
            {historico.length === 0 ? (
              <Text
                style={{
                  color: TEMA.muted,
                  textAlign: "center",
                  marginTop: 20,
                }}
              >
                Sem registos passados.
              </Text>
            ) : (
              historico.map((hist) => (
                <View
                  key={hist.id}
                  style={[
                    styles.historyCard,
                    { backgroundColor: TEMA.card, borderColor: TEMA.border },
                  ]}
                >
                  <View style={styles.flexHeader}>
                    <Text style={[styles.historyEquip, { color: TEMA.text }]}>
                      {hist.equipamento_nome}
                    </Text>
                    <Text style={{ color: TEMA.muted, fontSize: 12 }}>
                      {new Date(hist.data_hora).toLocaleDateString()}{" "}
                      {new Date(hist.data_hora).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.badgeSetor,
                      { backgroundColor: TEMA.bg, color: TEMA.text },
                    ]}
                  >
                    {hist.setor}
                  </Text>
                  <Text style={[styles.historyMsg, { color: TEMA.danger }]}>
                    {hist.mensagem}
                  </Text>
                  <View
                    style={{
                      backgroundColor: TEMA.bg,
                      padding: 10,
                      borderRadius: 8,
                      marginTop: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: TEMA.muted,
                        fontSize: 12,
                        fontWeight: "bold",
                        marginBottom: 2,
                      }}
                    >
                      Nota do Técnico:
                    </Text>
                    <Text style={{ color: TEMA.primary, fontStyle: "italic" }}>
                      "{hist.nota_resolucao}"
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* BOTTOM TAB BAR */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: TEMA.card, borderTopColor: TEMA.border },
        ]}
      >
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setAbaAtiva("dashboard")}
        >
          <Ionicons
            name="grid"
            size={22}
            color={abaAtiva === "dashboard" ? TEMA.primary : TEMA.muted}
          />
          <Text
            style={[
              styles.tabText,
              { color: abaAtiva === "dashboard" ? TEMA.primary : TEMA.muted },
            ]}
          >
            Dashboard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setAbaAtiva("motores")}
        >
          <Ionicons
            name="thermometer"
            size={22}
            color={abaAtiva === "motores" ? TEMA.primary : TEMA.muted}
          />
          <Text
            style={[
              styles.tabText,
              { color: abaAtiva === "motores" ? TEMA.primary : TEMA.muted },
            ]}
          >
            Motores
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setAbaAtiva("equipamentos")}
        >
          <Ionicons
            name="server"
            size={22}
            color={abaAtiva === "equipamentos" ? TEMA.primary : TEMA.muted}
          />
          <Text
            style={[
              styles.tabText,
              {
                color: abaAtiva === "equipamentos" ? TEMA.primary : TEMA.muted,
              },
            ]}
          >
            Gestão
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setAbaAtiva("historico")}
        >
          <Ionicons
            name="library"
            size={22}
            color={abaAtiva === "historico" ? TEMA.primary : TEMA.muted}
          />
          <Text
            style={[
              styles.tabText,
              { color: abaAtiva === "historico" ? TEMA.primary : TEMA.muted },
            ]}
          >
            Histórico
          </Text>
        </TouchableOpacity>
      </View>

      {/* MODAL: REGISTAR MANUTENÇÃO */}
      <Modal
        visible={modalResolucao.visivel}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: TEMA.card, borderColor: TEMA.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: TEMA.text }]}>
              Registar Manutenção
            </Text>
            <Text style={[styles.modalSub, { color: TEMA.muted }]}>
              Descreva a ação técnica realizada:
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: TEMA.bg,
                  color: TEMA.text,
                  borderColor: TEMA.border,
                  height: 80,
                  textAlignVertical: "top",
                },
              ]}
              placeholder="Ex: Reposição de gás"
              placeholderTextColor={TEMA.muted}
              multiline
              value={modalResolucao.nota}
              onChangeText={(text) =>
                setModalResolucao((prev) => ({ ...prev, nota: text }))
              }
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnOutline, { borderColor: TEMA.border }]}
                onPress={() =>
                  setModalResolucao({
                    visivel: false,
                    idAlerta: null,
                    nota: "",
                  })
                }
              >
                <Text style={[styles.btnOutlineText, { color: TEMA.text }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { backgroundColor: TEMA.primary, flex: 1, marginLeft: 10 },
                ]}
                onPress={resolverNotificacao}
              >
                <Text style={styles.btnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: CONFIRMAÇÃO GENÉRICA */}
      <Modal
        visible={modalConfirmacao.visivel}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: TEMA.card, borderColor: TEMA.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: TEMA.text }]}>
              {modalConfirmacao.titulo}
            </Text>
            <Text style={[styles.modalSub, { color: TEMA.muted }]}>
              {modalConfirmacao.msg}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnOutline, { borderColor: TEMA.border }]}
                onPress={() =>
                  setModalConfirmacao({
                    visivel: false,
                    titulo: "",
                    msg: "",
                    onConfirm: null,
                  })
                }
              >
                <Text style={[styles.btnOutlineText, { color: TEMA.text }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { backgroundColor: TEMA.danger, flex: 1, marginLeft: 10 },
                ]}
                onPress={() => {
                  modalConfirmacao.onConfirm();
                  setModalConfirmacao({ visivel: false });
                }}
              >
                <Text style={styles.btnText}>Sim, Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: SELECT (DROPDOWN NATIVO) */}
      <Modal
        visible={modalSelect.visivel}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: TEMA.card,
                borderColor: TEMA.border,
                maxHeight: "80%",
              },
            ]}
          >
            <View style={styles.flexHeader}>
              <Text style={[styles.modalTitle, { color: TEMA.text }]}>
                {modalSelect.titulo}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setModalSelect({
                    visivel: false,
                    titulo: "",
                    opcoes: [],
                    onSelect: null,
                  })
                }
              >
                <Ionicons name="close" size={24} color={TEMA.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {modalSelect.opcoes?.map((opc, index) => (
                <TouchableOpacity
                  key={index}
                  style={{
                    padding: 15,
                    borderBottomWidth: 1,
                    borderBottomColor: TEMA.border,
                  }}
                  onPress={() => {
                    modalSelect.onSelect(opc.value);
                    setModalSelect({ visivel: false });
                  }}
                >
                  <Text style={{ color: TEMA.text, fontSize: 16 }}>
                    {opc.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: FORMULÁRIO DE EQUIPAMENTO */}
      <Modal
        visible={modalForm.visivel}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: TEMA.card,
                borderColor: TEMA.border,
                maxHeight: "90%",
                padding: 0,
              },
            ]}
          >
            <View
              style={[
                styles.header,
                {
                  backgroundColor: TEMA.bg,
                  borderBottomColor: TEMA.border,
                  paddingTop: 15,
                  paddingBottom: 15,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                },
              ]}
            >
              <Text
                style={[styles.headerTitle, { color: TEMA.text, fontSize: 18 }]}
              >
                {modalForm.isEdit ? "Editar Equipamento" : "Novo Equipamento"}
              </Text>
              <TouchableOpacity
                onPress={() => setModalForm({ visivel: false })}
              >
                <Ionicons name="close" size={24} color={TEMA.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ padding: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.label, { color: TEMA.text }]}>
                Identificação (Nome)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: TEMA.bg,
                    color: TEMA.text,
                    borderColor: TEMA.border,
                  },
                ]}
                placeholder="Ex: Ilha Central"
                placeholderTextColor={TEMA.muted}
                value={formEquip.nome}
                onChangeText={(t) => setFormEquip({ ...formEquip, nome: t })}
              />

              <Text style={[styles.label, { color: TEMA.text }]}>
                Categoria / Tipo
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  {
                    backgroundColor: TEMA.bg,
                    borderColor: TEMA.border,
                    justifyContent: "center",
                  },
                ]}
                onPress={() =>
                  setModalSelect({
                    visivel: true,
                    titulo: "Selecionar Tipo",
                    opcoes: TIPOS_EQUIP.map((t) => ({ label: t, value: t })),
                    onSelect: (v) => setFormEquip({ ...formEquip, tipo: v }),
                  })
                }
              >
                <Text
                  style={{ color: formEquip.tipo ? TEMA.text : TEMA.muted }}
                >
                  {formEquip.tipo || "Selecione o Tipo..."}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.label, { color: TEMA.text }]}>
                Setor da Loja
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  {
                    backgroundColor: TEMA.bg,
                    borderColor: TEMA.border,
                    justifyContent: "center",
                  },
                ]}
                onPress={() =>
                  setModalSelect({
                    visivel: true,
                    titulo: "Selecionar Setor",
                    opcoes: SETORES.map((t) => ({ label: t, value: t })),
                    onSelect: (v) => setFormEquip({ ...formEquip, setor: v }),
                  })
                }
              >
                <Text
                  style={{ color: formEquip.setor ? TEMA.text : TEMA.muted }}
                >
                  {formEquip.setor || "Selecione o Setor..."}
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: TEMA.text }]}>
                    Temp. Mín (°C)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: TEMA.bg,
                        color: TEMA.text,
                        borderColor: TEMA.border,
                      },
                    ]}
                    placeholder="-18"
                    keyboardType="numeric"
                    placeholderTextColor={TEMA.muted}
                    value={formEquip.temp_min}
                    onChangeText={(t) =>
                      setFormEquip({ ...formEquip, temp_min: t })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: TEMA.text }]}>
                    Temp. Máx (°C)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: TEMA.bg,
                        color: TEMA.text,
                        borderColor: TEMA.border,
                      },
                    ]}
                    placeholder="-12"
                    keyboardType="numeric"
                    placeholderTextColor={TEMA.muted}
                    value={formEquip.temp_max}
                    onChangeText={(t) =>
                      setFormEquip({ ...formEquip, temp_max: t })
                    }
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: TEMA.text }]}>
                    Degelo (Horas)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: TEMA.bg,
                        color: TEMA.text,
                        borderColor: TEMA.border,
                      },
                    ]}
                    placeholder="6"
                    keyboardType="numeric"
                    placeholderTextColor={TEMA.muted}
                    value={formEquip.intervalo_degelo}
                    onChangeText={(t) =>
                      setFormEquip({ ...formEquip, intervalo_degelo: t })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: TEMA.text }]}>
                    Duração (Min)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: TEMA.bg,
                        color: TEMA.text,
                        borderColor: TEMA.border,
                      },
                    ]}
                    placeholder="30"
                    keyboardType="numeric"
                    placeholderTextColor={TEMA.muted}
                    value={formEquip.duracao_degelo}
                    onChangeText={(t) =>
                      setFormEquip({ ...formEquip, duracao_degelo: t })
                    }
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor: TEMA.primary,
                    marginTop: 10,
                    marginBottom: 40,
                  },
                ]}
                onPress={salvarEquipamento}
              >
                <Text style={styles.btnText}>Guardar Configurações</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loginContainer: { flex: 1, justifyContent: "center", padding: 20 },
  loginBox: {
    padding: 30,
    borderRadius: 16,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -1,
  },
  loginSubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 25,
    fontWeight: "500",
  },
  label: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 5,
    marginTop: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  btnPrimary: { padding: 15, borderRadius: 8, alignItems: "center" },
  btnText: { color: "white", fontWeight: "bold", fontSize: 16 },
  btnOutline: {
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
  },
  btnOutlineText: { fontWeight: "bold", fontSize: 16 },

  appContainer: { flex: 1 },
  header: {
    padding: 20,
    paddingTop: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  content: { padding: 15 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 15,
    marginTop: 5,
    letterSpacing: -0.5,
  },
  flexHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    marginTop: 5,
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  summaryCard: {
    width: "48%",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    elevation: 1,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  summaryValue: { fontSize: 32, fontWeight: "900" },

  emptyState: {
    alignItems: "center",
    padding: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyStateText: { fontSize: 18, fontWeight: "bold", marginTop: 10 },

  alertCard: {
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 6,
    marginBottom: 15,
  },
  alertTop: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  alertEquip: { fontSize: 16, fontWeight: "900", marginLeft: 10 },
  alertMsg: { fontSize: 15, marginBottom: 10, lineHeight: 20 },

  motorCard: {
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderLeftWidth: 6,
    borderWidth: 1,
    elevation: 1,
  },
  motorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  motorTitle: { fontSize: 18, fontWeight: "800" },
  badgeSetor: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 10,
    fontWeight: "bold",
    alignSelf: "flex-start",
    textTransform: "uppercase",
    marginBottom: 10,
    overflow: "hidden",
  },
  statusBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  statusInfo: { flex: 1 },
  statusText: {
    color: "white",
    fontWeight: "900",
    fontSize: 14,
    marginTop: 5,
    letterSpacing: 0.5,
  },
  statusLimits: { color: "white", fontSize: 11, opacity: 0.9, marginTop: 2 },
  tempDisplay: {
    backgroundColor: "rgba(255,255,255,0.2)",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    minWidth: 80,
  },
  tempDisplayLabel: {
    color: "white",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  tempDisplayValue: { color: "white", fontSize: 22, fontWeight: "900" },

  listCard: {
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  listTitle: { fontSize: 16, fontWeight: "bold" },
  listSub: { fontSize: 12, marginTop: 2 },
  listActions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
  },

  historyCard: {
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  historyEquip: { fontSize: 16, fontWeight: "bold" },
  historyMsg: { fontSize: 14, marginBottom: 5 },

  tabBar: {
    flexDirection: "row",
    position: "absolute",
    bottom: 0,
    width: "100%",
    paddingVertical: 12,
    paddingBottom: 25,
    borderTopWidth: 1,
    elevation: 10,
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 10, fontWeight: "bold", marginTop: 4 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: { padding: 20, borderRadius: 16, borderWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: "900", marginBottom: 5 },
  modalSub: { fontSize: 14, marginBottom: 15 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 15,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  toast: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    padding: 15,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    elevation: 10,
    zIndex: 9999,
  },
  toastText: {
    color: "white",
    fontWeight: "bold",
    marginLeft: 10,
    fontSize: 15,
  },
});
