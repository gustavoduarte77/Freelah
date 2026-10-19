import {
  PROFILE_BIO_MAX,
  PROFILE_HEADLINE_MAX,
  PROFILE_ROLE_LABEL,
  buildUpdateProfileRequest,
  profileToFormValues,
  toggleProfileRole,
  type MyJobsApiError,
  type ProfileFormValues,
  type ProfileRole,
  type PublicProfile,
} from "@freelah/shared";
import { Stack, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, TextField, colors } from "../src/components/ui";
import { OwnProfileGate } from "../src/features/profile/OwnProfileGate";
import { myJobsApi } from "../src/features/publish/api";
import { PAGE_PADDING, radius } from "../src/theme";

/** Editar perfil: papéis (um ou os dois), ocupação, apresentação e cidade. Telefone e e-mail não são editados aqui. */
export default function EditProfileScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Editar perfil" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">
          Editar perfil
        </Text>
        <OwnProfileGate redirect="/editar-perfil">{(profile) => <ProfileForm profile={profile} />}</OwnProfileGate>
      </ScrollView>
    </SafeAreaView>
  );
}

const ROLE_ORDER: ProfileRole[] = ["PROFESSIONAL", "CLIENT"];
const ROLE_HELP: Record<ProfileRole, string> = {
  PROFESSIONAL: "Quero encontrar trabalho e oferecer meus serviços.",
  CLIENT: "Quero contratar alguém e publicar oportunidades.",
};

function ProfileForm({ profile }: { profile: PublicProfile }) {
  const router = useRouter();
  const [values, setValues] = useState<ProfileFormValues>(() => profileToFormValues(profile));
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  };

  async function save() {
    if (saving) return;
    const built = buildUpdateProfileRequest(values);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await myJobsApi.updateProfile(built.request);
      router.replace("/meu-perfil" as Href);
    } catch (caught) {
      const failure = caught as MyJobsApiError;
      if (failure.kind === "validation") {
        setErrors(failure.fields as Partial<Record<keyof ProfileFormValues, string>>);
      } else {
        setFormError(failure.kind === "network" || failure.kind === "server" ? "Não foi possível salvar agora. Tente de novo." : failure.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form} testID="edit-profile-form">
      <View style={styles.group}>
        <Text style={styles.groupTitle}>Como você usa o Freelah</Text>
        {ROLE_ORDER.map((role) => {
          const checked = values.roles.includes(role);
          return (
            <Pressable
              key={role}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              aria-checked={checked}
              accessibilityLabel={PROFILE_ROLE_LABEL[role]}
              testID={`edit-role-${role}`}
              onPress={() => set("roles", toggleProfileRole(values.roles, role))}
              style={styles.checkRow}
            >
              <View style={[styles.checkBox, checked ? styles.checkBoxOn : null]}>{checked ? <Text style={styles.checkMark}>✓</Text> : null}</View>
              <View style={styles.checkText}>
                <Text style={styles.checkLabel}>{PROFILE_ROLE_LABEL[role]}</Text>
                <Text style={styles.checkHelp}>{ROLE_HELP[role]}</Text>
              </View>
            </Pressable>
          );
        })}
        {errors.roles ? (
          <Text style={styles.error} accessibilityRole="alert">
            {errors.roles}
          </Text>
        ) : null}
      </View>

      <TextField
        label="Ocupação (opcional)"
        help="Em poucas palavras, o que você faz. Aparece abaixo do seu nome."
        value={values.headline}
        onChangeText={(v) => set("headline", v)}
        error={errors.headline}
        placeholder="Ex.: Eletricista residencial"
        maxLength={PROFILE_HEADLINE_MAX + 20}
      />
      <TextField
        label="Apresentação (opcional)"
        value={values.bio}
        onChangeText={(v) => set("bio", v)}
        error={errors.bio}
        placeholder="Conte um pouco sobre você e o seu trabalho"
        multiline
        numberOfLines={5}
        maxLength={PROFILE_BIO_MAX + 50}
        style={styles.multiline}
      />
      <TextField label="Cidade" value={values.city} onChangeText={(v) => set("city", v)} error={errors.city} placeholder="Cidade" maxLength={120} />

      {formError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {formError}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button title="Salvar" onPress={() => void save()} loading={saving} disabled={saving} />
        <Button title="Cancelar" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace("/meu-perfil" as Href))} disabled={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: PAGE_PADDING, paddingBottom: 48, gap: 16 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  form: { gap: 16, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20 },
  group: { gap: 4 },
  groupTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, cursor: "pointer" },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkBoxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkMark: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  checkText: { flex: 1, gap: 2 },
  checkLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  checkHelp: { fontSize: 13, color: colors.muted },
  multiline: { minHeight: 120, textAlignVertical: "top", borderRadius: radius.md },
  error: { fontSize: 13, color: colors.error },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
