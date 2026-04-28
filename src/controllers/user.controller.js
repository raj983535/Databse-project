import { asyncHandler } from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/ApiResponse.js"

const registerUser = asyncHandler( async (req,res) => {
    // get user from frontend
    // validation -> not empty
    // check if user already exists -> through email & username
    // check for images, check for avatar
    // upload them cloudinary, avatar
    // create user object -> create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return response


    // extract all the data points from the request.body
    const {username, fullname, email, password } = req.body
    // console.log("email:", email);


    //validates all the above data
    if(
        [fullname,email,username,password].some((field)=>field?.trim()==="")
    ){
        throw new ApiError(400,"All fields are required")
    }


    //check that if user already exists with the email or username 
    const existedUser = await User.findOne({
        $or: [ {username} , {email} ]
    })


    //if exists then throw error
    if(existedUser){
        throw new ApiError(409,"User with email or username already exists")
    }


    //find the local path of the cover image
    const avatarLocalPath = req.files?.avatar[0]?.path
    // const coverImageLocalPath = req.files?.coverImage[0]?.path


    //valideates the coverImage logic that what if it not exists
    let coverImageLocalPath
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }


    // if avatar is not find then throw error
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
    }

    // console.log(req.files); 

    // if avatar is find then upload on the cloudinary because avatar is menditory field
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)


    //if avatar is not uploaded then throw an error
    if(!avatar){
        throw new ApiError(400,"Avatar file is required")
    }

    // if everything is good then create an object and return it

        const user = await User.create({
        fullname,
        avatar:avatar.url,
        coverImage:coverImage?.url || "",
        email,
        password,
        username:username.toLowerCase()
    })

    // remove the password and refreshtoken from the user (see in later)

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )


    // throw error if User is not created
    if(!createdUser){
        throw new ApiError(500,"Something went wrong while registering a user")
    }


    // if created then show successfully
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )

} )

//export the register user
export {registerUser}

