import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireAuthUser,
  requireOrganizationAdminAccess,
  requireProjectAccess,
  slugify,
} from "./lib/auth";
import { exposureModeValidator } from "./lib/constants";

export const listAccessible = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const [orgMemberships, projectMemberships] = await Promise.all([
      ctx.db.query("organizationMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("projectMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
    ]);

    const organizations = await Promise.all(
      orgMemberships.map(async (membership) => {
        const organization = await ctx.db.get(membership.organizationId);
        if (!organization) {
          return null;
        }
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
          .collect();
        return {
          id: organization._id,
          name: organization.name,
          slug: organization.slug,
          kind: organization.kind,
          role: membership.role,
          projects: projects
            .filter((project) =>
              projectMemberships.some((projectMembership) => projectMembership.projectId === project._id),
            )
            .map((project) => ({
              id: project._id,
              name: project.name,
              slug: project.slug,
              visibility: project.visibility,
              isDefault: project._id === user.defaultProjectId,
              role:
                projectMemberships.find((projectMembership) => projectMembership.projectId === project._id)?.role ??
                "viewer",
            })),
        };
      }),
    );

    return {
      organizations: organizations.filter(Boolean),
      defaultOrgId: user.defaultOrgId,
      defaultProjectId: user.defaultProjectId,
    };
  },
});

export const listMembers = query({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { user } = await requireProjectAccess(ctx, args.projectId, "viewer");
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    const [projectMembers, organizationMembers] = await Promise.all([
      ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) => q.eq("projectId", args.projectId))
        .collect(),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organization_and_user", (q) => q.eq("organizationId", project.organizationId))
        .collect(),
    ]);

    return await Promise.all(
      projectMembers.map(async (membership) => {
        const memberUser = await ctx.db.get(membership.userId);
        const orgMembership = organizationMembers.find((entry) => entry.userId === membership.userId);
        return {
          id: membership._id,
          userId: membership.userId,
          name: memberUser?.name,
          email: memberUser?.email,
          projectRole: membership.role,
          organizationRole: orgMembership?.role ?? "member",
          isCurrentUser: membership.userId === user._id,
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    visibility: v.optional(exposureModeValidator),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id),
      )
      .unique();
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new ConvexError("Unauthorized");
    }

    const projectId = await ctx.db.insert("projects", {
      organizationId: args.organizationId,
      name: args.name.trim(),
      slug: `${slugify(args.name)}-${String(Date.now()).slice(-6)}`,
      visibility: "public_full",
      createdByUserId: user._id,
    });
    await ctx.db.insert("projectMembers", {
      projectId,
      userId: user._id,
      role: "editor",
      joinedAt: Date.now(),
    });
    return projectId;
  },
});

export const addMemberByEmail = mutation({
  args: {
    projectId: v.id("projects"),
    email: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    organizationRole: v.optional(v.union(v.literal("admin"), v.literal("member"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }
    const { user } = await requireOrganizationAdminAccess(ctx, project.organizationId);

    const memberUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .unique();
    if (!memberUser) {
      throw new ConvexError("User not found. They need to sign in once before they can be added.");
    }

    const now = Date.now();
    const existingOrgMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", memberUser._id),
      )
      .unique();
    if (!existingOrgMembership) {
      await ctx.db.insert("organizationMembers", {
        organizationId: project.organizationId,
        userId: memberUser._id,
        role: args.organizationRole ?? "member",
        joinedAt: now,
      });
    }

    const existingProjectMembership = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", memberUser._id),
      )
      .unique();
    if (existingProjectMembership) {
      await ctx.db.patch(existingProjectMembership._id, {
        role: args.role,
      });
    } else {
      await ctx.db.insert("projectMembers", {
        projectId: args.projectId,
        userId: memberUser._id,
        role: args.role,
        joinedAt: now,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: project.organizationId,
      projectId: project._id,
      action: "project.member_upserted",
      resourceType: "project",
      resourceId: String(project._id),
      metadata: {
        email: memberUser.email,
        role: args.role,
        organizationRole: args.organizationRole ?? existingOrgMembership?.role ?? "member",
      },
      createdAt: now,
    });

    return null;
  },
});

export const updateVisibility = mutation({
  args: {
    projectId: v.id("projects"),
    visibility: exposureModeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "editor");
    await ctx.db.patch(args.projectId, { visibility: "public_full" });
    return null;
  },
});

export const updateMemberRole = mutation({
  args: {
    membershipId: v.id("projectMembers"),
    role: v.union(v.literal("editor"), v.literal("viewer")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new ConvexError("Project membership not found");
    }
    const project = await ctx.db.get(membership.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }
    const { user } = await requireOrganizationAdminAccess(ctx, project.organizationId);
    const memberUser = await ctx.db.get(membership.userId);

    await ctx.db.patch(membership._id, {
      role: args.role,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: project.organizationId,
      projectId: project._id,
      action: "project.member_role_updated",
      resourceType: "project",
      resourceId: String(project._id),
      metadata: {
        membershipId: membership._id,
        email: memberUser?.email,
        role: args.role,
      },
      createdAt: Date.now(),
    });

    return null;
  },
});
