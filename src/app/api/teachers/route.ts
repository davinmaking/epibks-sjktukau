import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "未授权" }, { status: 401 }) };
  }

  const { data: teacher } = await supabase
    .from("teachers")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!teacher || teacher.role !== "admin") {
    return {
      error: NextResponse.json({ error: "仅管理员可操作" }, { status: 403 }),
    };
  }

  return { userId: user.id };
}

export async function POST(request: Request) {
  const auth = await verifyAdmin();
  if ("error" in auth && auth.error) return auth.error;

  try {
    const body = await request.json();
    const { name, email, password, role, class_name } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "请填写所有必填字段" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码至少需要6个字符" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Create auth user
    const { data: authData, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError) {
      return NextResponse.json(
        { error: `创建用户失败: ${createError.message}` },
        { status: 400 }
      );
    }

    // Insert teacher record
    const { error: insertError } = await admin.from("teachers").insert({
      id: authData.user.id,
      name,
      email,
      role: role || "teacher",
      class_name: class_name || null,
    });

    if (insertError) {
      // Clean up auth user if teacher insert fails
      await admin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: `创建教师记录失败: ${insertError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, id: authData.user.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `操作失败: ${message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdmin();
  if ("error" in auth && auth.error) return auth.error;

  try {
    const body = await request.json();
    const { id, name, role, class_name, password } = body;

    if (!id) {
      return NextResponse.json(
        { error: "缺少教师ID" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // If changing role away from admin, check this isn't the last admin
    if (role && role !== "admin") {
      const { data: currentTeacher } = await admin
        .from("teachers")
        .select("role")
        .eq("id", id)
        .single();

      if (currentTeacher?.role === "admin") {
        const { count } = await admin
          .from("teachers")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin");

        if (count !== null && count <= 1) {
          return NextResponse.json(
            { error: "无法移除最后一个管理员角色" },
            { status: 400 }
          );
        }
      }
    }

    // Update teacher record
    const updateData: Record<string, string | null> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (class_name !== undefined) updateData.class_name = class_name || null;

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await admin
        .from("teachers")
        .update(updateData)
        .eq("id", id);

      if (updateError) {
        return NextResponse.json(
          { error: `更新失败: ${updateError.message}` },
          { status: 400 }
        );
      }
    }

    // Update password if provided
    if (password) {
      if (password.length < 6) {
        return NextResponse.json(
          { error: "密码至少需要6个字符" },
          { status: 400 }
        );
      }

      const { error: pwError } = await admin.auth.admin.updateUserById(id, {
        password,
      });

      if (pwError) {
        return NextResponse.json(
          { error: `重置密码失败: ${pwError.message}` },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `操作失败: ${message}` },
      { status: 500 }
    );
  }
}
