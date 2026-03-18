import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import * as Audio from "expo-audio";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import { Tabs } from "expo-router";
import * as Sharing from "expo-sharing";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { io } from "socket.io-client";

import { createStyles, getTheme } from "./_styles";

// 🔴 ATENÇÃO: Troque pelo IP do seu servidor Node.js
const BASE_IP = "http://192.168.200.27:3001";
const API_URL = `${BASE_IP}/api`;
const screenWidth = Dimensions.get("window").width;

const TIPOS_EQUIP = [
  "Câmara Frigorífica",
  "Câmara Refrigerada",
  "Câmara de Congelados",
  "Ilha de Congelados",
  "Balcão Refrigerado Aberto",
  "Balcão Refrigerado com Porta",
  "Arca Horizontal",
];
const SETORES = [
  "Farmácia / Vacinas",
  "Açougue",
  "Padaria",
  "Rotisseria",
  "Frios",
  "Cooler",
  "FLV",
  "Geral",
];

export default function App() {
  const [token, setToken] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [somAtivo, setSomAtivo] = useState(true);
  const somAtivoRef = useRef(true);

  const [abaAtiva, setAbaAtiva] = useState("dashboard");
  const [equipamentos, setEquipamentos] = useState([]);
  const [notificacoes, setNotificacoes] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [relatorios, setRelatorios] = useState([]);

  const [conectadoSocket, setConectadoSocket] = useState(false);
  const [latencia, setLatencia] = useState(0);

  const [menuAberto, setMenuAberto] = useState(false);
  const menuAnim = useRef(new Animated.Value(-screenWidth * 0.8)).current;

  const [setorFiltro, setSetorFiltro] = useState("");
  const [equipamentoFiltro, setEquipamentoFiltro] = useState("");
  const [termoPesquisa, setTermoPesquisa] = useState("");
  const [mostrarTabelaBruta, setMostrarTabelaBruta] = useState(false);
  const [dataInicio, setDataInicio] = useState(
    new Date(new Date().setDate(new Date().getDate() - 1)),
  );
  const [dataFim, setDataFim] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState({
    show: false,
    mode: "inicio",
  });

  const [toast, setToast] = useState({
    visivel: false,
    msg: "",
    tipo: "success",
  });
  const toastAnim = useRef(new Animated.Value(-150)).current;

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
    umidade_min: "",
    umidade_max: "",
    intervalo_degelo: "",
    duracao_degelo: "",
    setor: "",
  });

  // --- CORREÇÃO: HOOK DE ÁUDIO NO TOPO ---
  const audioSource =
    "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
  const player = Audio.useAudioPlayer(audioSource);

  const theme = useMemo(() => getTheme(isDarkMode), [isDarkMode]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const api = useMemo(
    () =>
      axios.create({
        baseURL: API_URL,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    [token],
  );

  const lastAlertIdRef = useRef(-1);

  useEffect(() => {
    verificarLogin();
  }, []);

  useEffect(() => {
    if (!token) return;
    carregarDadosBase();
    if (abaAtiva === "relatorios") carregarRelatorios();

    const socket = io(BASE_IP, { transports: ["websocket"] });
    socket.on("connect", () => setConectadoSocket(true));
    socket.on("disconnect", () => {
      setConectadoSocket(false);
      setLatencia(0);
    });

    socket.on("nova_leitura", (dados) => {
      setEquipamentos((prev) =>
        prev.map((eq) =>
          eq.id === dados.equipamento_id
            ? {
                ...eq,
                ultima_temp: dados.temperatura,
                ultima_umidade: dados.umidade,
              }
            : eq,
        ),
      );
      if (abaAtiva === "relatorios") {
        setRelatorios((prev) => {
          const arr = [...prev, dados];
          if (arr.length > 2000) arr.shift();
          return arr;
        });
      }
    });

    socket.on("atualizacao_dados", () => carregarDadosBase());

    const pingInterval = setInterval(() => {
      const start = Date.now();
      socket.emit("medir_latencia", start, (enviadoEm) => {
        setLatencia(Date.now() - enviadoEm);
      });
    }, 2500);

    return () => {
      clearInterval(pingInterval);
      socket.disconnect();
    };
  }, [token, abaAtiva]);

  const carregarDadosBase = async () => {
    try {
      const [resEquip, resNotif, resHist] = await Promise.all([
        api.get("/equipamentos"),
        api.get("/notificacoes"),
        api.get("/notificacoes/historico"),
      ]);
      setEquipamentos(resEquip.data);
      setHistorico(resHist.data);

      const idMaisAlto =
        resNotif.data.length > 0
          ? Math.max(...resNotif.data.map((n) => n.id))
          : 0;
      if (
        lastAlertIdRef.current !== -1 &&
        idMaisAlto > lastAlertIdRef.current
      ) {
        const novos = resNotif.data.filter(
          (n) => n.id > lastAlertIdRef.current,
        );
        if (novos.length > 0) {
          const isDegelo =
            novos[0].tipo_alerta === "DEGELO" ||
            novos[0].mensagem.includes("DEGELO");
          if (!isDegelo && somAtivoRef.current) tocarAlarme();
          mostrarToast(
            `${isDegelo ? "❄️" : "🚨"} ${novos[0].mensagem}`,
            isDegelo ? "info" : "error",
          );
        }
      }
      lastAlertIdRef.current = idMaisAlto;
      setNotificacoes(resNotif.data);
    } catch (error) {
      if (error?.response?.status === 401) fazerLogout();
    }
  };

  const tocarAlarme = useCallback(() => {
    if (!somAtivoRef.current || !player) return;
    player.play();
    // Simula bipe duplo
    setTimeout(() => {
      player.seekTo(0);
      player.play();
    }, 600);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, [player]);

  // --- FUNÇÕES DE INTERAÇÃO ---
  const alternarSom = () => {
    const novoStatus = !somAtivo;
    setSomAtivo(novoStatus);
    somAtivoRef.current = novoStatus;
  };

  const resolverNotificacao = async () => {
    const notaFinal =
      modalResolucao.nota.trim() === ""
        ? "Resolvido via App Mobile"
        : modalResolucao.nota;
    try {
      await api.put(`/notificacoes/${modalResolucao.idAlerta}/resolver`, {
        nota_resolucao: notaFinal,
      });
      setModalResolucao({ visivel: false, idAlerta: null, nota: "" });
      carregarDadosBase();
      mostrarToast("Intervenção registada!", "success");
    } catch (error) {
      mostrarToast("Erro ao resolver.", "error");
    }
  };

  const resolverTodasNotificacoes = async () => {
    try {
      await api.put(`/notificacoes/resolver-todas`);
      carregarDadosBase();
      mostrarToast("Alertas limpos.", "success");
    } catch (error) {
      mostrarToast("Erro ao limpar.", "error");
    }
  };

  const verificarLogin = async () => {
    const tokenSalvo = await AsyncStorage.getItem("tokenFrioMonitorWeb");
    if (tokenSalvo) setToken(tokenSalvo);
    setLoading(false);
  };

  const alternarTema = async () => {
    const novoTema = !isDarkMode;
    setIsDarkMode(novoTema);
    await AsyncStorage.setItem("temaMobile", novoTema ? "dark" : "light");
  };

  const toggleMenu = () => {
    Animated.timing(menuAnim, {
      toValue: menuAberto ? -screenWidth * 0.8 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setMenuAberto(!menuAberto);
  };

  const mostrarToast = useCallback(
    (msg: string, tipo = "success") => {
      setToast({ visivel: true, msg, tipo });
      Animated.spring(toastAnim, {
        toValue: Platform.OS === "ios" ? 60 : 40,
        useNativeDriver: true,
      }).start();
      setTimeout(() => {
        Animated.timing(toastAnim, {
          toValue: -150,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setToast({ visivel: false, msg: "", tipo: "success" }));
      }, 3500);
    },
    [toastAnim],
  );

  const fazerLogin = async () => {
    if (!usuario || !senha)
      return mostrarToast("Preencha todos os campos.", "warning");
    try {
      const res = await axios.post(`${API_URL}/login`, { usuario, senha });
      setToken(res.data.token);
      await AsyncStorage.setItem("tokenFrioMonitorWeb", res.data.token);
      mostrarToast("Acesso Autorizado", "success");
    } catch (error) {
      mostrarToast("Credenciais incorretas.", "error");
    }
  };

  const fazerLogout = async () => {
    setToken("");
    setMenuAberto(false);
    await AsyncStorage.removeItem("tokenFrioMonitorWeb");
  };

  const carregarRelatorios = async () => {
    try {
      const res = await api.get(
        `/relatorios?data_inicio=${dataInicio.toISOString()}&data_fim=${dataFim.toISOString()}`,
      );
      setRelatorios(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await carregarDadosBase();
    if (abaAtiva === "relatorios") await carregarRelatorios();
    setRefreshing(false);
  }, [api, abaAtiva]);

  const aplicarNormaANVISA = () => {
    const s = formEquip.setor;
    const t = formEquip.tipo;
    if (!s || !t) return mostrarToast("Selecione Setor e Tipo.", "warning");
    let tMin = "",
      tMax = "",
      uMin = "",
      uMax = "";
    if (s === "Farmácia / Vacinas") {
      if (t.includes("Congelados") || t === "Arca Horizontal") {
        tMin = "-25";
        tMax = "-15";
        uMin = "35";
        uMax = "60";
      } else {
        tMin = "2";
        tMax = "8";
        uMin = "35";
        uMax = "65";
      }
    } else {
      if (
        t === "Ilha de Congelados" ||
        t === "Arca Horizontal" ||
        t === "Câmara de Congelados"
      ) {
        tMin = "-24";
        tMax = "-18";
        uMin = "60";
        uMax = "80";
      } else if (t.includes("Balcão Refrigerado")) {
        const isAberto = t === "Balcão Refrigerado Aberto";
        if (s === "Açougue") {
          tMin = "0";
          tMax = "4";
          uMin = "85";
          uMax = "95";
        } else if (s === "Frios" || s === "Rotisseria") {
          tMin = "0";
          tMax = isAberto ? "7" : "5";
          uMin = "60";
          uMax = isAberto ? "85" : "80";
        } else if (s === "FLV") {
          tMin = "8";
          tMax = "12";
          uMin = "85";
          uMax = "95";
        } else {
          tMin = "0";
          tMax = isAberto ? "8" : "5";
          uMin = "60";
          uMax = "85";
        }
      } else if (t.includes("Câmara")) {
        if (s === "Açougue") {
          tMin = "0";
          tMax = "4";
          uMin = "85";
          uMax = "95";
        } else if (s === "FLV") {
          tMin = "8";
          tMax = "10";
          uMin = "85";
          uMax = "95";
        } else {
          tMin = "0";
          tMax = "8";
          uMin = "60";
          uMax = "85";
        }
      } else {
        tMin = "2";
        tMax = "8";
        uMin = "60";
        uMax = "80";
      }
    }
    setFormEquip((prev) => ({
      ...prev,
      temp_min: tMin.toString(),
      temp_max: tMax.toString(),
      umidade_min: uMin.toString(),
      umidade_max: uMax.toString(),
      intervalo_degelo: "6",
      duracao_degelo: "30",
    }));
    mostrarToast("Limites ANVISA aplicados.", "info");
  };

  const salvarEquipamento = async () => {
    if (!formEquip.nome || !formEquip.tipo || !formEquip.setor)
      return mostrarToast("Preencha campos obrigatórios!", "error");
    try {
      if (modalForm.isEdit)
        await api.put(`/equipamentos/${formEquip.id}/edit`, formEquip);
      else await api.post("/equipamentos", formEquip);
      mostrarToast("Equipamento guardado!", "success");
      setModalForm({ visivel: false, isEdit: false });
      carregarDadosBase();
    } catch (error) {
      mostrarToast("Erro ao guardar.", "error");
    }
  };

  const exportarDocumento = async (tipo: "pdf" | "csv") => {
    try {
      const dados =
        abaAtiva === "historico"
          ? historicoFiltrado
          : equipamentoFiltro
            ? relatorios.filter((r) => r.nome === equipamentoFiltro)
            : relatorios;
      if (dados.length === 0)
        return mostrarToast("Sem dados para exportar.", "warning");

      if (tipo === "csv") {
        let csv =
          abaAtiva === "historico"
            ? "Data/Hora,Equipamento,Setor,Ocorrencia,Acao Tecnica\n"
            : "Data/Hora,Equipamento,Setor,Temp(C),Hum(%)\n";
        dados.forEach((r) => {
          csv +=
            abaAtiva === "historico"
              ? `"${new Date(r.data_hora).toLocaleString()}","${
                  r.equipamento_nome
                }","${r.setor}","${r.mensagem}","${r.nota_resolucao}"\n`
              : `"${new Date(r.data_hora).toLocaleString()}","${r.nome}","${
                  r.setor
                }","${r.temperatura}","${r.umidade}"\n`;
        });
        const fileUri =
          FileSystem.documentDirectory + `PharmaX_Export_${Date.now()}.csv`;
        await FileSystem.writeAsStringAsync(fileUri, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(fileUri);
      } else {
        let rows = "";
        if (abaAtiva === "historico")
          dados.forEach(
            (r) =>
              (rows += `<tr><td>${new Date(
                r.data_hora,
              ).toLocaleString()}</td><td>${r.equipamento_nome}</td><td>${
                r.mensagem
              }</td><td>${r.nota_resolucao}</td></tr>`),
          );
        else
          dados.forEach(
            (r) =>
              (rows += `<tr><td>${new Date(
                r.data_hora,
              ).toLocaleString()}</td><td>${r.nome}</td><td>${
                r.temperatura
              }</td><td>${r.umidade}</td></tr>`),
          );

        const html = `<html><head><style>body {font-family: sans-serif;} table {width: 100%; border-collapse: collapse;} th, td {border: 1px solid #ddd; padding: 12px; text-align: left;} th {background-color: #059669; color: white;}</style></head><body><h2>PharmaX - Relatório Oficial</h2><table><tr>${
          abaAtiva === "historico"
            ? "<th>Data</th><th>Equipamento</th><th>Ocorrência</th><th>Ação</th>"
            : "<th>Data</th><th>Equipamento</th><th>Temp (°C)</th><th>Hum (%)</th>"
        }</tr>${rows}</table></body></html>`;
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri);
      }
    } catch (e) {
      mostrarToast("Erro ao exportar.", "error");
    }
  };

  // --- MEMOIZAÇÃO DE DADOS ---
  const { qtdTotal, qtdDegelo, qtdFalha, qtdOperando } = useMemo(() => {
    const total = equipamentos.length;
    const degelo = equipamentos.filter((e) => e.em_degelo).length;
    const falha = equipamentos.filter(
      (e) => !e.motor_ligado && !e.em_degelo,
    ).length;
    return {
      qtdTotal: total,
      qtdDegelo: degelo,
      qtdFalha: falha,
      qtdOperando: total - degelo - falha,
    };
  }, [equipamentos]);

  const termoLC = termoPesquisa.toLowerCase();
  const eqPesquisaLista = useMemo(
    () =>
      equipamentos.filter(
        (eq) =>
          eq.nome.toLowerCase().includes(termoLC) ||
          (eq.setor && eq.setor.toLowerCase().includes(termoLC)),
      ),
    [equipamentos, termoLC],
  );
  const historicoFiltrado = useMemo(
    () =>
      historico.filter(
        (h) =>
          h.equipamento_nome.toLowerCase().includes(termoLC) ||
          (h.setor && h.setor.toLowerCase().includes(termoLC)),
      ),
    [historico, termoLC],
  );
  const eqFiltrados = useMemo(
    () =>
      setorFiltro
        ? equipamentos.filter((e) => e.setor === setorFiltro)
        : equipamentos,
    [equipamentos, setorFiltro],
  );

  const relatoriosFiltrados = useMemo(
    () =>
      equipamentoFiltro
        ? relatorios.filter((r) => r.nome === equipamentoFiltro)
        : relatorios,
    [relatorios, equipamentoFiltro],
  );
  const dadosGraficoFormatados = useMemo(() => {
    const limitados = relatoriosFiltrados.slice(-50);
    return {
      labels:
        limitados.length > 0
          ? limitados.map(
              (d) => new Date(d.data_hora).getMinutes().toString() + "m",
            )
          : ["0"],
      datasets: [
        {
          data:
            limitados.length > 0
              ? limitados.map((d) => parseFloat(d.temperatura))
              : [0],
          color: () => theme.primary,
          strokeWidth: 3,
        },
        {
          data:
            limitados.length > 0
              ? limitados.map((d) => parseFloat(d.umidade || 0))
              : [0],
          color: () => theme.info,
          strokeWidth: 3,
        },
      ],
      legend: ["Temp (°C)", "Hum (%)"],
    };
  }, [relatoriosFiltrados, theme]);

  const kpisAnalise = useMemo(() => {
    let maxT = -Infinity,
      minT = Infinity,
      sumT = 0,
      maxU = -Infinity,
      minU = Infinity,
      sumU = 0,
      countU = 0;
    relatoriosFiltrados.forEach((d) => {
      const t = parseFloat(d.temperatura);
      const u = parseFloat(d.umidade || 0);
      if (t > maxT) maxT = t;
      if (t < minT) minT = t;
      sumT += t;
      if (u > 0) {
        if (u > maxU) maxU = u;
        if (u < minU) minU = u;
        sumU += u;
        countU++;
      }
    });
    return {
      maxT: maxT === -Infinity ? "--" : maxT.toFixed(1),
      minT: minT === Infinity ? "--" : minT.toFixed(1),
      avgT: relatoriosFiltrados.length
        ? (sumT / relatoriosFiltrados.length).toFixed(1)
        : "--",
      maxU: maxU === -Infinity ? "--" : maxU.toFixed(1),
      minU: minU === Infinity ? "--" : minU.toFixed(1),
      avgU: countU ? (sumU / countU).toFixed(1) : "--",
    };
  }, [relatoriosFiltrados]);

  const mktValue = useMemo(() => {
    if (relatoriosFiltrados.length === 0) return "--";
    const dH = 83.144;
    const R = 0.0083144;
    let somaExp = 0;
    relatoriosFiltrados.forEach(
      (d) =>
        (somaExp += Math.exp(-dH / (R * (parseFloat(d.temperatura) + 273.15)))),
    );
    return (
      dH / R / -Math.log(somaExp / relatoriosFiltrados.length) -
      273.15
    ).toFixed(2);
  }, [relatoriosFiltrados]);

  const ultimasLeiturasRaw = useMemo(
    () => [...relatoriosFiltrados].reverse().slice(0, 150),
    [relatoriosFiltrados],
  );

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );

  if (!token) {
    return (
      <View style={styles.loginContainer}>
        <View style={styles.loginBox}>
          <Ionicons
            name="snow"
            size={60}
            color={theme.primary}
            style={{ textAlign: "center", marginBottom: 10 }}
          />
          <Text style={styles.loginTitle}>PharmaX</Text>
          <Text style={styles.loginSubtitle}>Enterprise Telemetry</Text>
          <TextInput
            style={styles.input}
            placeholder="Utilizador"
            placeholderTextColor={theme.muted}
            value={usuario}
            onChangeText={setUsuario}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Palavra-passe"
            placeholderTextColor={theme.muted}
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
          />
          <TouchableOpacity style={styles.btnPrimary} onPress={fazerLogin}>
            <Text style={styles.btnText}>ENTRAR NO SISTEMA</Text>
          </TouchableOpacity>
        </View>
        <Animated.View
          style={[
            styles.toast,
            {
              transform: [{ translateY: toastAnim }],
              backgroundColor:
                toast.tipo === "success" ? theme.primary : theme.danger,
            },
          ]}
        >
          <Text style={styles.toastText}>{toast.msg}</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.appContainer}>
      <Tabs.Screen
        options={{ headerShown: false, tabBarStyle: { display: "none" } }}
      />

      {/* HEADER WEB-STYLE */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
          <TouchableOpacity onPress={toggleMenu}>
            <Ionicons name="menu" size={32} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {abaAtiva === "dashboard"
              ? "Monitorização Geral"
              : abaAtiva === "motores"
                ? "Termómetros"
                : abaAtiva === "umidade"
                  ? "Higrómetros"
                  : abaAtiva === "equipamentos"
                    ? "Inventário"
                    : abaAtiva === "relatorios"
                      ? "Análise MKT"
                      : "Auditoria RDC"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={styles.pingContainer}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: conectadoSocket
                    ? theme.secondary
                    : theme.danger,
                },
              ]}
            />
            <Text style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>
              {conectadoSocket ? `${latencia}ms` : "Offline"}
            </Text>
          </View>
          <TouchableOpacity onPress={alternarSom}>
            <Ionicons
              name={somAtivo ? "notifications" : "notifications-off"}
              size={22}
              color={somAtivo ? "white" : theme.danger}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync();
              alternarTema();
            }}
          >
            <Ionicons
              name={isDarkMode ? "sunny" : "moon"}
              size={22}
              color="rgba(255,255,255,0.8)"
            />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View
        style={[
          styles.toast,
          {
            transform: [{ translateY: toastAnim }],
            backgroundColor:
              toast.tipo === "success"
                ? theme.secondary
                : toast.tipo === "info"
                  ? theme.info
                  : theme.danger,
          },
        ]}
      >
        <Ionicons
          name={
            toast.tipo === "success"
              ? "checkmark-circle"
              : toast.tipo === "info"
                ? "information-circle"
                : "warning"
          }
          size={24}
          color="white"
        />
        <Text style={styles.toastText}>{toast.msg}</Text>
      </Animated.View>

      {/* CONTEÚDO SCROLLÁVEL */}
      <ScrollView
        contentContainerStyle={styles.contentScroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {abaAtiva === "dashboard" && (
          <View>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryValue}>{qtdTotal}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Operando</Text>
                <Text style={[styles.summaryValue, { color: theme.secondary }]}>
                  {qtdOperando}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Degelo</Text>
                <Text style={[styles.summaryValue, { color: theme.info }]}>
                  {qtdDegelo}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Falhas</Text>
                <Text style={[styles.summaryValue, { color: theme.danger }]}>
                  {qtdFalha}
                </Text>
              </View>
            </View>

            <View style={styles.flexHeader}>
              <Text style={styles.sectionTitle}>Alertas Críticos</Text>
              {notificacoes.length > 0 && (
                <TouchableOpacity
                  onPress={() =>
                    setModalConfirmacao({
                      visivel: true,
                      titulo: "Limpar Todos",
                      msg: "Deseja encerrar todos os alertas?",
                      onConfirm: resolverTodasNotificacoes,
                    })
                  }
                >
                  <Text style={{ color: theme.danger, fontWeight: "bold" }}>
                    Limpar Todos
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {notificacoes.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="checkmark-circle"
                  size={60}
                  color={theme.secondary}
                />
                <Text style={styles.emptyStateText}>Sistema Estabilizado</Text>
              </View>
            ) : (
              notificacoes.map((notif) => {
                const isDegelo =
                  notif.tipo_alerta === "DEGELO" ||
                  notif.mensagem.includes("DEGELO");
                const isRede = notif.tipo_alerta === "REDE";
                let icon = "warning";
                let cColor = theme.danger;
                let bgLight = theme.dangerLight;
                if (isDegelo) {
                  icon = "snow";
                  cColor = theme.info;
                  bgLight = theme.infoLight;
                }
                if (isRede) {
                  icon = "wifi";
                  cColor = theme.warning;
                  bgLight = isDarkMode ? "#78350f" : "#fef3c7";
                }

                return (
                  <View
                    key={notif.id}
                    style={[
                      styles.alertCard,
                      { backgroundColor: bgLight, borderLeftColor: cColor },
                    ]}
                  >
                    <View style={styles.alertTop}>
                      <Ionicons name={icon as any} size={22} color={cColor} />
                      <Text style={[styles.alertEquip, { color: cColor }]}>
                        {notif.equipamento_nome}
                      </Text>
                    </View>
                    <Text style={styles.badgeSetor}>{notif.setor}</Text>
                    <Text style={styles.alertMsg}>{notif.mensagem}</Text>
                    <TouchableOpacity
                      style={[styles.btnPrimary, { backgroundColor: cColor }]}
                      onPress={() =>
                        setModalResolucao({
                          visivel: true,
                          idAlerta: notif.id,
                          nota: "",
                        })
                      }
                    >
                      <Text style={styles.btnText}>
                        {isDegelo
                          ? "Confirmar Fim de Ciclo"
                          : "Assumir Intervenção"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}

        {(abaAtiva === "motores" || abaAtiva === "umidade") && (
          <View>
            <View style={styles.flexHeader}>
              <Text style={styles.sectionTitle}>
                {abaAtiva === "motores" ? "Sensores" : "Higrómetros"}
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
                <Ionicons name="filter" size={14} color={theme.text} />
                <Text
                  style={{ color: theme.text, fontWeight: "900", fontSize: 12 }}
                >
                  {setorFiltro || "Todos"}
                </Text>
              </TouchableOpacity>
            </View>

            {eqFiltrados.map((eq) => {
              const isT = abaAtiva === "motores";
              const val = isT ? eq.ultima_temp : eq.ultima_umidade;
              const min = isT ? eq.temp_min : eq.umidade_min || 40;
              const max = isT ? eq.temp_max : eq.umidade_max || 60;
              const isAlta = val > max && !eq.em_degelo;
              const isBaixa = val < min && !eq.em_degelo;
              const range = max - min;
              const offset = val - min;
              let pct = (offset / range) * 100;
              if (pct > 100) pct = 100;
              if (pct < 5) pct = 5;

              let sColor = isT ? theme.secondary : theme.info;
              let sText = isT ? "LIGADO" : "ESTÁVEL";
              if (eq.em_degelo) {
                sColor = theme.info;
                sText = "DEGELO";
              } else if (isT && !eq.motor_ligado) {
                sColor = theme.danger;
                sText = "PARADO";
              } else if (isAlta || isBaixa) {
                sColor = theme.warning;
                sText = "ALERTA";
              }

              return (
                <View
                  key={eq.id}
                  style={[styles.motorCard, { borderLeftColor: sColor }]}
                >
                  <View style={styles.motorHeader}>
                    <Text style={styles.motorTitle}>{eq.nome}</Text>
                    <Text style={styles.badgeSetor}>{eq.setor}</Text>
                  </View>
                  <View style={[styles.statusBox, { backgroundColor: sColor }]}>
                    <View style={styles.statusInfo}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Ionicons
                          name={isT ? "thermometer" : "water"}
                          size={18}
                          color="white"
                        />
                        <Text style={styles.statusText}>{sText}</Text>
                      </View>
                      <Text style={styles.statusLimits}>
                        {min}
                        {isT ? "°C" : "%"} a {max}
                        {isT ? "°C" : "%"}
                      </Text>
                      <View style={styles.thermalBarBg}>
                        <View
                          style={[
                            styles.thermalBarFill,
                            {
                              width: `${pct}%`,
                              backgroundColor:
                                isAlta || isBaixa
                                  ? theme.danger
                                  : eq.em_degelo
                                    ? theme.info
                                    : "white",
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <View style={styles.tempDisplay}>
                      <Text style={styles.tempDisplayLabel}>Atual</Text>
                      <Text
                        style={[
                          styles.tempDisplayValue,
                          { color: isAlta || isBaixa ? "#ffcccc" : "white" },
                        ]}
                      >
                        {val ? `${val}${isT ? "°C" : "%"}` : "--"}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {abaAtiva === "equipamentos" && (
          <View>
            <View style={styles.flexHeader}>
              <Text style={styles.sectionTitle}>Inventário</Text>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { paddingHorizontal: 15, paddingVertical: 8 },
                ]}
                onPress={() => {
                  setFormEquip({
                    id: null,
                    nome: "",
                    tipo: "",
                    temp_min: "",
                    temp_max: "",
                    umidade_min: "",
                    umidade_max: "",
                    intervalo_degelo: "",
                    duracao_degelo: "",
                    setor: "",
                  });
                  setModalForm({ visivel: true, isEdit: false });
                }}
              >
                <Text style={styles.btnText}>+ Novo</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={theme.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar ID ou setor..."
                placeholderTextColor={theme.muted}
                value={termoPesquisa}
                onChangeText={setTermoPesquisa}
              />
            </View>

            {eqPesquisaLista.map((eq) => (
              <View key={eq.id} style={styles.listCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{eq.nome}</Text>
                  <Text style={styles.listSub}>{eq.tipo}</Text>
                  <Text style={[styles.badgeSetor, { marginTop: 8 }]}>
                    {eq.setor}
                  </Text>
                </View>
                <View style={styles.listActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setFormEquip({
                        id: eq.id,
                        nome: eq.nome,
                        tipo: eq.tipo,
                        temp_min: eq.temp_min.toString(),
                        temp_max: eq.temp_max.toString(),
                        umidade_min: eq.umidade_min?.toString() || "",
                        umidade_max: eq.umidade_max?.toString() || "",
                        intervalo_degelo: eq.intervalo_degelo.toString(),
                        duracao_degelo: eq.duracao_degelo.toString(),
                        setor: eq.setor,
                      });
                      setModalForm({ visivel: true, isEdit: true });
                    }}
                  >
                    <Ionicons name="pencil" size={20} color={theme.warning} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() =>
                      setModalConfirmacao({
                        visivel: true,
                        titulo: "Excluir",
                        msg: `Eliminar "${eq.nome}"?`,
                        onConfirm: () =>
                          api
                            .delete(`/equipamentos/${eq.id}`)
                            .then(() => carregarDadosBase()),
                      })
                    }
                  >
                    <Ionicons name="trash" size={20} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {abaAtiva === "relatorios" && (
          <View>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() =>
                  setShowDatePicker({ show: true, mode: "inicio" })
                }
              >
                <Ionicons name="calendar" size={16} color={theme.text} />
                <Text
                  style={{ color: theme.text, fontSize: 12, fontWeight: "800" }}
                >
                  {dataInicio.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => setShowDatePicker({ show: true, mode: "fim" })}
              >
                <Ionicons name="calendar" size={16} color={theme.text} />
                <Text
                  style={{ color: theme.text, fontSize: 12, fontWeight: "800" }}
                >
                  {dataFim.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            </View>
            {showDatePicker.show && (
              <DateTimePicker
                value={showDatePicker.mode === "inicio" ? dataInicio : dataFim}
                mode="date"
                display="default"
                onChange={(e, d) => {
                  setShowDatePicker({ show: false, mode: "" });
                  if (d) {
                    showDatePicker.mode === "inicio"
                      ? setDataInicio(d)
                      : setDataFim(d);
                  }
                }}
              />
            )}

            <View
              style={[styles.motorCard, { borderLeftColor: theme.primary }]}
            >
              <Text
                style={{
                  color: theme.muted,
                  fontWeight: "bold",
                  fontSize: 12,
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Temp. Cinética Média (MKT)
              </Text>
              <Text
                style={{
                  fontSize: 32,
                  fontWeight: "900",
                  color: theme.primary,
                }}
              >
                {mktValue}°C
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 10,
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.muted,
                      fontWeight: "800",
                    }}
                  >
                    Mín
                  </Text>
                  <Text style={{ color: theme.secondary, fontWeight: "bold" }}>
                    {kpisAnalise.minT}°C
                  </Text>
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.muted,
                      fontWeight: "800",
                    }}
                  >
                    Média
                  </Text>
                  <Text style={{ color: theme.text, fontWeight: "bold" }}>
                    {kpisAnalise.avgT}°C
                  </Text>
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.muted,
                      fontWeight: "800",
                    }}
                  >
                    Máx
                  </Text>
                  <Text style={{ color: theme.danger, fontWeight: "bold" }}>
                    {kpisAnalise.maxT}°C
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.motorCard,
                { borderLeftColor: theme.info, alignItems: "center" },
              ]}
            >
              <Text
                style={{
                  color: theme.muted,
                  fontWeight: "bold",
                  fontSize: 12,
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Curva de Telemetria
              </Text>
              <LineChart
                data={dadosGraficoFormatados}
                width={screenWidth - 80}
                height={220}
                bezier
                style={{ borderRadius: 8 }}
                chartConfig={{
                  backgroundColor: theme.card,
                  backgroundGradientFrom: theme.card,
                  backgroundGradientTo: theme.card,
                  decimalPlaces: 1,
                  color: (o) => theme.text,
                  labelColor: (o) => theme.muted,
                  propsForDots: { r: "3", strokeWidth: "1" },
                }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={() => exportarDocumento("csv")}
              >
                <Ionicons name="download" size={18} color={theme.text} />
                <Text style={styles.btnOutlineText}>CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { flex: 1, backgroundColor: theme.danger, padding: 15 },
                ]}
                onPress={() => exportarDocumento("pdf")}
              >
                <Ionicons name="document-text" size={18} color="white" />
                <Text style={styles.btnText}>PDF</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.btnOutline}
              onPress={() => setMostrarTabelaBruta(!mostrarTabelaBruta)}
            >
              <Ionicons name="list" size={18} color={theme.text} />
              <Text style={styles.btnOutlineText}>
                {mostrarTabelaBruta
                  ? "Ocultar Tabela Bruta"
                  : "Ver Matriz de Dados"}
              </Text>
            </TouchableOpacity>

            {mostrarTabelaBruta && (
              <View
                style={[
                  styles.motorCard,
                  { marginTop: 15, padding: 0, overflow: "hidden" },
                ]}
              >
                <View
                  style={[
                    styles.tableRow,
                    { backgroundColor: theme.bg, paddingHorizontal: 15 },
                  ]}
                >
                  <Text style={[styles.tableCell, styles.tableHeader]}>
                    Data/Hora
                  </Text>
                  <Text style={[styles.tableCell, styles.tableHeader]}>
                    Equip.
                  </Text>
                  <Text style={[styles.tableCell, styles.tableHeader]}>
                    Temp
                  </Text>
                </View>
                {ultimasLeiturasRaw.map((d, i) => (
                  <View
                    key={i}
                    style={[styles.tableRow, { paddingHorizontal: 15 }]}
                  >
                    <Text style={styles.tableCell}>
                      {new Date(d.data_hora).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                    <Text style={styles.tableCell}>{d.nome}</Text>
                    <Text
                      style={[
                        styles.tableCell,
                        { fontWeight: "900", color: theme.primary },
                      ]}
                    >
                      {d.temperatura}°C
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {abaAtiva === "historico" && (
          <View>
            <View style={styles.flexHeader}>
              <Text style={styles.sectionTitle}>Diário de Auditoria</Text>
              <TouchableOpacity onPress={() => exportarDocumento("pdf")}>
                <Ionicons name="print" size={24} color={theme.danger} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={theme.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar histórico..."
                placeholderTextColor={theme.muted}
                value={termoPesquisa}
                onChangeText={setTermoPesquisa}
              />
            </View>

            {historicoFiltrado.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="library" size={50} color={theme.muted} />
                <Text style={styles.emptyStateText}>Livro Limpo</Text>
              </View>
            ) : (
              historicoFiltrado.map((hist) => (
                <View key={hist.id} style={styles.historyCard}>
                  <View style={styles.flexHeader}>
                    <Text style={styles.historyEquip}>
                      {hist.equipamento_nome}
                    </Text>
                    <Text
                      style={{
                        color: theme.muted,
                        fontSize: 12,
                        fontWeight: "800",
                      }}
                    >
                      {new Date(hist.data_hora).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.badgeSetor}>{hist.setor}</Text>
                  <Text style={styles.historyMsg}>{hist.mensagem}</Text>
                  <View
                    style={{
                      backgroundColor: theme.bg,
                      padding: 12,
                      borderRadius: 10,
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.muted,
                        fontSize: 11,
                        fontWeight: "900",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Ação Executada:
                    </Text>
                    <Text
                      style={{
                        color: theme.primary,
                        fontStyle: "italic",
                        fontWeight: "700",
                      }}
                    >
                      "{hist.nota_resolucao}"
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* === MENÚ LATERAL (SIDEBAR) === */}
      {menuAberto && (
        <TouchableWithoutFeedback onPress={toggleMenu}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
      )}
      <Animated.View
        style={[styles.sidebar, { transform: [{ translateX: menuAnim }] }]}
      >
        <View style={styles.sidebarHeader}>
          <Ionicons name="snow" size={32} color="white" />
          <Text style={styles.sidebarTitle}>PharmaX</Text>
        </View>
        <ScrollView style={{ paddingVertical: 10 }}>
          {[
            { id: "dashboard", icon: "grid", label: "Visão Global" },
            { id: "motores", icon: "thermometer", label: "Painel Termómetros" },
            { id: "umidade", icon: "water", label: "Controlo Higrómetros" },
            {
              id: "equipamentos",
              icon: "server",
              label: "Config. Equipamentos",
            },
            { id: "relatorios", icon: "analytics", label: "Relatórios MKT" },
            { id: "historico", icon: "library", label: "Auditoria RDC" },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.navItem,
                abaAtiva === tab.id && {
                  backgroundColor: theme.primary + "20",
                  borderLeftColor: theme.primary,
                },
              ]}
              onPress={() => {
                setAbaAtiva(tab.id);
                toggleMenu();
              }}
            >
              <Ionicons
                name={tab.icon as any}
                size={22}
                color={abaAtiva === tab.id ? theme.primary : theme.muted}
                style={{ marginRight: 15 }}
              />
              <Text
                style={[
                  styles.navText,
                  {
                    color: abaAtiva === tab.id ? theme.primary : theme.text,
                    fontWeight: abaAtiva === tab.id ? "900" : "600",
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View
          style={{
            padding: 20,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          <TouchableOpacity
            style={[styles.btnOutline, { borderColor: theme.danger }]}
            onPress={fazerLogout}
          >
            <Text style={{ color: theme.danger, fontWeight: "bold" }}>
              Terminar Sessão
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* MODAL RESOLUÇÃO */}
      <Modal
        visible={modalResolucao.visivel}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registar Intervenção</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              placeholder="Nota técnica..."
              placeholderTextColor={theme.muted}
              multiline
              value={modalResolucao.nota}
              onChangeText={(text) =>
                setModalResolucao((prev) => ({ ...prev, nota: text }))
              }
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={() =>
                  setModalResolucao({
                    visivel: false,
                    idAlerta: null,
                    nota: "",
                  })
                }
              >
                <Text style={styles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1, marginLeft: 10 }]}
                onPress={resolverNotificacao}
              >
                <Text style={styles.btnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL SELECT */}
      <Modal
        visible={modalSelect.visivel}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { padding: 0 }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {modalSelect.opcoes?.map((opc, index) => (
                <TouchableOpacity
                  key={index}
                  style={{
                    padding: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  }}
                  onPress={() => {
                    modalSelect.onSelect(opc.value);
                    setModalSelect({
                      visivel: false,
                      titulo: "",
                      opcoes: [],
                      onSelect: null,
                    });
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {opc.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL FORMULÁRIO EQUIPAMENTO */}
      <Modal
        visible={modalForm.visivel}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "90%", padding: 0 }]}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                padding: 20,
                backgroundColor: theme.bg,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
              }}
            >
              <Text style={styles.modalTitle}>
                {modalForm.isEdit ? "Editar" : "Novo"} Equipamento
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={aplicarNormaANVISA}
                  style={{ padding: 5 }}
                >
                  <Ionicons
                    name="shield-checkmark"
                    size={24}
                    color={theme.info}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    setModalForm({ visivel: false, isEdit: false })
                  }
                >
                  <Ionicons name="close" size={28} color={theme.muted} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView
              style={{ padding: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.label}>Nome</Text>
              <TextInput
                style={styles.input}
                value={formEquip.nome}
                onChangeText={(t) => setFormEquip({ ...formEquip, nome: t })}
              />
              <Text style={styles.label}>Setor</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() =>
                  setModalSelect({
                    visivel: true,
                    titulo: "Setor",
                    opcoes: SETORES.map((s) => ({ label: s, value: s })),
                    onSelect: (v) => setFormEquip({ ...formEquip, setor: v }),
                  })
                }
              >
                <Text
                  style={{ color: formEquip.setor ? theme.text : theme.muted }}
                >
                  {formEquip.setor || "Selecione..."}
                </Text>
              </TouchableOpacity>
              <Text style={styles.label}>Tipo</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() =>
                  setModalSelect({
                    visivel: true,
                    titulo: "Tipo",
                    opcoes: TIPOS_EQUIP.map((s) => ({ label: s, value: s })),
                    onSelect: (v) => setFormEquip({ ...formEquip, tipo: v }),
                  })
                }
              >
                <Text
                  style={{ color: formEquip.tipo ? theme.text : theme.muted }}
                >
                  {formEquip.tipo || "Selecione..."}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Temp Min</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formEquip.temp_min}
                    onChangeText={(t) =>
                      setFormEquip({ ...formEquip, temp_min: t })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Temp Max</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formEquip.temp_max}
                    onChangeText={(t) =>
                      setFormEquip({ ...formEquip, temp_max: t })
                    }
                  />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Hum Min</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formEquip.umidade_min}
                    onChangeText={(t) =>
                      setFormEquip({ ...formEquip, umidade_min: t })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Hum Max</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formEquip.umidade_max}
                    onChangeText={(t) =>
                      setFormEquip({ ...formEquip, umidade_max: t })
                    }
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.btnPrimary, { marginTop: 10, marginBottom: 40 }]}
                onPress={salvarEquipamento}
              >
                <Text style={styles.btnText}>Guardar</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CONFIRMAÇÃO MODAL */}
      <Modal
        visible={modalConfirmacao.visivel}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{modalConfirmacao.titulo}</Text>
            <Text style={styles.modalSub}>{modalConfirmacao.msg}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={() =>
                  setModalConfirmacao({
                    visivel: false,
                    titulo: "",
                    msg: "",
                    onConfirm: null,
                  })
                }
              >
                <Text style={styles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { backgroundColor: theme.danger, flex: 1, marginLeft: 15 },
                ]}
                onPress={() => {
                  modalConfirmacao.onConfirm();
                  setModalConfirmacao({
                    visivel: false,
                    titulo: "",
                    msg: "",
                    onConfirm: null,
                  });
                }}
              >
                <Text style={styles.btnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
