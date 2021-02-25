// This is a minimal implementation of a raymarching scene,
// with a box at the center of the screen. Additionally, the
// the user can move the camera with the mouse.

precision mediump float;

uniform float u_time;
uniform vec2 u_mouse;
uniform vec2 u_resolution;

#define PI 3.1415926
#define MAX_MARCH_ITERATIONS 100
#define MAX_SCENE_DISTANCE 100.0
#define MIN_SURFACE_DISTANCE 0.01

// These two functions are implemented here in the event
// the client GLSL version does not provide them.
float atan2(float y, float x){
    return x == 0.0 ? sign(y)*PI/2.0 : atan(y, x);
}

float round(float x) {
    return floor(x + 0.5);
}

// Utility functions.
float smooth_max(float a, float b, float k) {
    return max(a, b) + pow(max(k - abs(a - b), 0.0), 2.0)/(4.0*k);
}

vec2 rotate_2d(vec2 vector, float angle) {
    mat2 rotation_matrix = mat2(
        cos(angle), -sin(angle),
        sin(angle), cos(angle)
    );
    return rotation_matrix * vector.xy;
}

vec3 translate(vec3 vector, vec3 translation) {
    mat4 transation_matrix = mat4(
        1.0, 0.0, 0.0, translation.x,
        0.0, 1.0, 0.0, translation.y,
        0.0, 0.0, 1.0, translation.z,
        0.0, 0.0, 0.0, 1.0
    );
    return (transation_matrix*vec4(vector, 0.0)).xyz;
}

vec3 rotate_x(vec3 vector, float angle) {
    mat4 rotation_matrix = mat4(
        1,  0.0,          0.0,        0.0,
        0.0, cos(angle),  sin(angle), 0.0,
        0.0, -sin(angle), cos(angle), 0.0,
        0.0, 0.0,         0.0,        1.0
    );
    return (rotation_matrix*vec4(vector, 0.0)).xyz;
}

vec3 rotate_y(vec3 vector, float angle) {
    mat4 rotation_matrix = mat4(
        cos(angle),  0.0, sin(angle), 0.0,
        0.0,         1.0, 0.0,        0.0,
        -sin(angle), 0.0, cos(angle), 0.0,
        0.0,         0.0, 0.0,        1.0
    );
    return (rotation_matrix*vec4(vector, 0.0)).xyz;
}

vec3 rotate_z(vec3 vector, float angle) {
    mat4 rotation_matrix = mat4(
        cos(angle),  sin(angle), 0.0, 0.0,
        -sin(angle), cos(angle), 0.0, 0.0,
        0.0,         0.0,        1.0, 0.0,
        0.0,         0.0,        0.0, 1.0
    );
    return (rotation_matrix*vec4(vector, 0.0)).xyz;
}


// Shapes.
struct sphere_t {
    vec3 position;
    float radius;
};

struct box_t {
    vec3 position;
    vec3 dimensions;
};

struct stick_t {
    vec3 position;
    float height;
    float thickness;
};

struct rounded_box_t {
    vec3 position;
    vec3 dimensions;
    float radius;
};

struct cross_t {
    vec3 position;
    vec3 dimensions;
};

struct gear_t {
    vec3 position;
    float radius;
    float thickness;
    float teeth;
    float angular_offset;
    bool clockwise;
};

struct gear_axle_t {
    vec3 position;
    float width;
};

// Signed distance functions.
float sd_sphere(vec3 point, sphere_t sphere) {
    return length(point - sphere.position) - sphere.radius;
}

float sd_box(vec3 point, box_t box) {
    vec3 half_sizes = box.dimensions / 2.0;
    return length(max(abs(point - box.position) - half_sizes, vec3(0.0)));
}

float sd_stick(vec3 point, stick_t stick) {
    box_t box = box_t(stick.position, vec3(0.0, stick.height, 0.0));
    return sd_box(point, box) - stick.thickness;
}

float sd_cross(vec3 point, cross_t crozz) {
    box_t box = box_t(crozz.position, crozz.dimensions);
    box_t box2 = box_t(crozz.position, crozz.dimensions.zyx);

    return min(sd_box(point, box), sd_box(point, box2));
}

float sd_rounded_box(vec3 point, rounded_box_t rounded_box) {
    return sd_box(point, box_t(rounded_box.position, rounded_box.dimensions)) - rounded_box.radius;
}

// This function composes a gear from a single hollowed cylinder
// and `teeth` number of rounded boxes, lying parallel to the xz plane,
// as well as a "cross" centered in the gear. Note that it currently
// only rotates in the xz-plane.
//
//                 _──_   |‾‾‾|   _──_
//                \    \__|   |__/    /
//                 \                 / 
//           /‾‾──_/    _─‾| |‾‾─_   \_──‾‾\
//          /__      _─‾   | |    ‾─_     __\
//             ‾/   /      | |      \   \‾
//         |‾‾‾‾   |───────| |───────|   ‾‾‾‾|
//         |____   |───────| |───────|   ____|
//             _\   \      | |      /   /_
//          \‾‾      ‾─_   | |   _─‾      ‾‾/
//           \__──‾\    ‾─_| |_─‾    /‾──__/
//                 /                 \
//                /    /‾‾|   |‾‾\    \
//                 ‾──‾   |___|   ‾──‾
//
float sd_gear(vec3 point, gear_t gear) {
    // First move the point to compensate for the object's position
    vec3 transformed_point = point - gear.position;

    // This is to rotate them at a static angle first
    // transformed_point = rotate_x(transformed_point, -PI/4.0);
    // Then rotate the point around the y-axis
    transformed_point = rotate_y(transformed_point, (u_time+ gear.angular_offset) * (gear.clockwise ? 1.0 : -1.0));


    // Add a cross for some interesting detail.
    cross_t crozz = cross_t(
        vec3(0),
        vec3(1.5*gear.radius, 0.1*gear.radius, 0.1*gear.radius)
    );
    float cross_distance = sd_cross(transformed_point, crozz) - 0.02;

    // Now we add the gear teeth. First, we need to find which "sector"
    // the input point is in with resepect to the xz plane
    float angle_per_tooth = 2.0*PI/gear.teeth;
    float raw_angle = atan2(transformed_point.z, transformed_point.x);
    float tooth_number = round(raw_angle/angle_per_tooth);

    // ... then map it to the sector for the "primary" tooth...
    float rotation_angle = tooth_number*angle_per_tooth;
    transformed_point.xz = rotate_2d(transformed_point.xz, rotation_angle);

    // ... by considering how close it is to it if it were rotated 
    // there. Doing this effectively clones the one tooth `teeth` times...
    rounded_box_t box = rounded_box_t(
        vec3(gear.radius, 0.0, 0.0), 
        vec3(gear.radius/2.0, 1.9*gear.thickness, gear.radius/4.0),
        gear.thickness*0.1
    );
    float min_tooth_distance = sd_rounded_box(transformed_point, box);

    // Add a hollow cylinder...
    float cylinder_distance = max(abs(length(transformed_point.xz) - 0.85*gear.radius) - 0.2, abs(transformed_point.y) - gear.thickness);

    // Now union all the things... 
    float gear_distance = min(
        min_tooth_distance, 
        min(cylinder_distance, cross_distance));

    // Finally return the gear with some smoothing and rounding.
    return smooth_max(gear_distance, abs(transformed_point.y) - gear.thickness, 0.05);
}

float sd_gear_axle(vec3 point, gear_axle_t axle) {
    gear_t gear = gear_t
        (axle.position + vec3(0.0, 0.5*axle.width, 0.0),
        1.5, 0.2, 12.0, 0.0, true);
    gear_t gear2 = gear_t
        (axle.position - vec3(0.0, 0.5*axle.width, 0.0),
        1.5, 0.2, 12.0, 0.0, true);
    stick_t stick = stick_t(axle.position, 1.06*axle.width, 0.05);

    return min(sd_stick(point, stick), min(sd_gear(point, gear), sd_gear(point, gear2)));
}

// Note that this function contains all the knowledge of 
// all objects in the scene.
float get_nearest_distance(vec3 point) {
    gear_axle_t axle = gear_axle_t(vec3(0.0), 8.0);

    sphere_t sphere = sphere_t(vec3(0.0), 0.7);

    // Note that we effectively make copies of the primary
    // gear axle by swizzling and rotating the point.
    float nearest_distance = sd_sphere(point, sphere);
    nearest_distance = min(nearest_distance, sd_gear_axle(point.zyx, axle));
    nearest_distance = min(nearest_distance, sd_gear_axle(point.yxz, axle));
    nearest_distance = min(nearest_distance, sd_gear_axle(point.yzx, axle));
    nearest_distance = min(nearest_distance, sd_gear_axle(rotate_y(rotate_x(point, PI/4.0), PI/12.0), axle));
    nearest_distance = min(nearest_distance, sd_gear_axle(rotate_y(rotate_z(point, PI/4.0), PI/12.0), axle));
    nearest_distance = min(nearest_distance, sd_gear_axle(rotate_y(rotate_x(rotate_z(point, PI/2.0), PI/4.0), PI/12.0), axle));

    return nearest_distance;
}

// This takes a ray, whose origin and direction are passed in,
// and returns the distance to the closest object in a scene.
float march(vec3 ray_origin, vec3 ray_direction) {
    // Start at the ray origin...
	float ray_distance = 0.;
    vec3 object_color = vec3(0.0);

    for(int i=0; i<MAX_MARCH_ITERATIONS; i++) {
        // March down the ray the current distance
    	vec3 new_point = ray_origin + ray_direction*ray_distance;

        // Get the distance to the closest object
        float nearest_distance = get_nearest_distance(new_point);

        // Add that distance to the current one
        ray_distance += nearest_distance;

        // If we've gone too far or we're sufficiently close to an object
        // stop iterating.
        if(ray_distance > MAX_SCENE_DISTANCE || nearest_distance < MIN_SURFACE_DISTANCE)
            break;
    }

    return ray_distance;
}

// This function computes the normal vector at the point passed in.
// NOTA BENE: `get_nearest_distance` is what's doing most of the work
// here since only it knows about the objects in the scene.
vec3 get_normal_vector(vec3 point) {
    float nearest_distance = get_nearest_distance(point);

    // This computes a normal by finding the distances between each of
    // three points slightly along the x, y, and z axes away from
    // the point. Each of these distances contributes to their
    // respective components of the normal vector, i.e.:
    //
    //                  dx*î + dy*ĵ + dz*k̂
    float nearest_x = get_nearest_distance(point - vec3(0.01, 0., 0.));
    float nearest_y = get_nearest_distance(point - vec3(0., 0.01, 0.));
    float nearest_z = get_nearest_distance(point - vec3(0., 0., 0.01));

    vec3 normal = nearest_distance - vec3(nearest_x, nearest_y, nearest_z);

    return normalize(normal);
}

// TODO: Explain how this code works
vec3 get_camera_direction(vec2 uv, vec3 p, vec3 l, float zoom) {
    vec3 f = normalize(l-p),
        r = normalize(cross(vec3(0,1,0), f)),
        u = cross(f,r),
        c = f*zoom,
        i = c + uv.x*r + uv.y*u,
        d = normalize(i);
    return d;
}

// Note that this function has all knowledge of light sources,
// in this case a single one.
vec3 get_color(vec3 camera_position, vec3 camera_direction, float nearest_distance) {
    vec3 color = vec3(0.0);
    vec3 light_source = vec3(0.0, 3.0, 0.0);

    if(nearest_distance < MAX_SCENE_DISTANCE) {
    	vec3 surface_point = camera_position + camera_direction * nearest_distance;
    	vec3 surface_normal = get_normal_vector(surface_point);
        
        // Just use the normal as a basis for the color.
        color += 0.5*surface_normal + 0.5;
    }

    // This is apparently for "gamma correction".
    return pow(color, vec3(.4545));;
}

void main() {
    // Center image and set aspect ratio to something pleasing.
    vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / u_resolution.y;

    // Get mouse position in uv coordinates.
	vec2 mouse_position = u_mouse.xy/u_resolution.xy;
    
    vec3 initial_camera_position = vec3(0, 1, -15);

    // Set up two rotation matrices, one to rotate about the y-axis
    // in response to moving the mouse along the x-axis...
    float theta_y = -mouse_position.x*PI+1.0;
    mat3 rotation_about_y_axis = mat3(
        cos(theta_y),  0.0,          sin(theta_y),
        0.0,           1.0,          0.0,
        -sin(theta_y), 0.0,          cos(theta_y));
    // ... and the other to rotate about the x-axis
    // in response to moving the mouse along the y-axis.
    float theta_x = -mouse_position.y*2.0*PI;
    mat3 rotation_about_x_axis = mat3(
        1.0,           0.0,          0.0,
        0.0,           cos(theta_x), -sin(theta_x),
        0.0,           sin(theta_x), cos(theta_x));

    // Now move the camera.
    vec3 camera_position = rotation_about_y_axis*rotation_about_x_axis*initial_camera_position;

    // TODO: Explain how this code works
    vec3 camera_direction = get_camera_direction(uv, camera_position, vec3(0), 1.);

    // MARCH ONWARD!!!
    float nearest_distance = march(camera_position, camera_direction);

        // Finally, set the color of the pixel.
    vec3 color = get_color(camera_position, camera_direction, nearest_distance);
    gl_FragColor = vec4(color, 1.0);
}