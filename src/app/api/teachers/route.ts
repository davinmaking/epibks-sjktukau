import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES } from "@/lib/constants";

const VALID_ROLES = new Set<string>(ROLES);
const MIN_PASSWORD_LENGTH = 8;

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

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `密码至少需要${MIN_PASSWORD_LENGTH}个字符` },
        { status: 400 }
      );
    }

    // Validate role against allowlist
    const validatedRole = role || "teacher";
    if (!VALID_ROLES.has(validatedRole)) {
      return NextResponse.json(
        { error: "无效的角色" },
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
        { error: "创建用户失败" },
        { status: 400 }
      );
    }

    // Insert teacher record
    const { error: insertError } = await admin.from("teachers").insert({
      id: authData.user.id,
      name,
      email,
      role: validatedRole,
      class_name: class_name || null,
    });

    if (insertError) {
      // Clean up auth user if teacher insert fails
      await admin.auth.admin.deleteUser(authData.user.id);
      console.error("Failed to create teacher record:", insertError.message);
      return NextResponse.json(
        { error: "创建教师记录失败" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, id: authData.user.id });
  } catch (err) {
    console.error("Teacher creation error:", err);
    return NextResponse.json(
      { error: "操作失败" },
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

    // Validate role against allowlist
    if (role !== undefined && !VALID_ROLES.has(role)) {
      return NextResponse.json(
        { error: "无效的角色" },
        { status: 400 }
      );
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
        console.error("Failed to update teacher:", updateError.message);
        return NextResponse.json(
          { error: "更新失败" },
          { status: 400 }
        );
      }
    }

    // Update password if provided
    if (password) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json(
          { error: `密码至少需要${MIN_PASSWORD_LENGTH}个字符` },
          { status: 400 }
        );
      }

      const { error: pwError } = await admin.auth.admin.updateUserById(id, {
        password,
      });

      if (pwError) {
        console.error("Failed to reset password:", pwError.message);
        return NextResponse.json(
          { error: "重置密码失败" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Teacher update error:", err);
    return NextResponse.json(
      { error: "操作失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdmin();
  if ("error" in auth && auth.error) return auth.error;

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "缺少教师ID" },
        { status: 400 }
      );
    }

    // Cannot delete yourself
    if (id === auth.userId) {
      return NextResponse.json(
        { error: "无法删除当前登录的账户" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Check if this is the last admin
    const { data: targetTeacher } = await admin
      .from("teachers")
      .select("role")
      .eq("id", id)
      .single();

    if (!targetTeacher) {
      return NextResponse.json(
        { error: "教师不存在" },
        { status: 404 }
      );
    }

    if (targetTeacher.role === "admin") {
      const { count } = await admin
        .from("teachers")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");

      if (count !== null && count <= 1) {
        return NextResponse.json(
          { error: "无法删除最后一个管理员" },
          { status: 400 }
        );
      }
    }

    // Delete teacher record first (FK constraint)
    const { error: deleteError } = await admin
      .from("teachers")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Failed to delete teacher:", deleteError.message);
      return NextResponse.json(
        { error: "删除教师记录失败" },
        { status: 400 }
      );
    }

    // Delete auth user
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(id);

    if (authDeleteError) {
      console.error("Failed to delete auth user:", authDeleteError.message);
      // Teacher record already deleted — log but don't fail
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Teacher deletion error:", err);
    return NextResponse.json(
      { error: "操作失败" },
      { status: 500 }
    );
  }
}
